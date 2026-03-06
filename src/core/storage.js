// Storage management module
// Handles IndexedDB persistence for save-specific data (historical data, route statuses, config)
//
// ARCHITECTURE: Transactional Storage Model
// ==========================================
// Same backup/restore pattern as before, now built on IndexedDB instead of localStorage.
// IndexedDB has no practical size limit for our use case (~GB vs 5-10MB localStorage cap).
//
// KEY SCHEMA (all keys are strings):
//   meta::saves                     → { [saveName]: SaveMetadata }
//   save::{saveName}::historicalData → { days: {...} }          (shared/immutable)
//   save::{saveName}::working::{key} → any                      (transactional - working)
//   save::{saveName}::saved::{key}   → any                      (transactional - committed)
//
// LIFECYCLE:
//   1. Game loads  → restore() copies saved:* → working:* (rollback to saved state)
//   2. Play game   → data accumulates in working:*
//   3. Game saves  → backup() copies working:* → saved:*  (commit transaction)

import { CONFIG } from '../config.js';

const DB_NAME    = 'AdvancedAnalytics';
const DB_VERSION = 1;
const STORE_NAME = 'analytics';

// Keys that are immutable once written — stored at save root, not duplicated
const SHARED_KEYS       = ['historicalData'];
// Keys that use the working/saved transactional split
const TRANSACTIONAL_KEYS = ['routeStatuses', 'configCache'];

// ---------------------------------------------------------------------------
// Low-level IDB helpers (module-private)
// ---------------------------------------------------------------------------

let _db = null;

/**
 * Open (or reuse) the IndexedDB connection.
 * @returns {Promise<IDBDatabase>}
 */
async function _getDB() {
    if (_db) return _db;

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        req.onsuccess = (event) => {
            _db = event.target.result;
            _db.onclose = () => { _db = null; };   // reconnect on next call
            resolve(_db);
        };

        req.onerror   = () => reject(req.error);
        req.onblocked = () => reject(new Error('[Storage] IDB upgrade blocked'));
    });
}

/**
 * Wrap a single IDB request in a Promise.
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function _wrap(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror   = () => reject(request.error);
    });
}

/**
 * Execute a single-key read.
 * Returns null (not undefined) when the key is missing.
 */
async function _idbGet(key) {
    const db    = await _getDB();
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const result = await _wrap(store.get(key));
    return result !== undefined ? result : null;
}

/**
 * Execute a single-key write.
 */
async function _idbSet(key, value) {
    const db    = await _getDB();
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    return _wrap(store.put(value, key));
}

/**
 * Execute a single-key delete.
 */
async function _idbDelete(key) {
    const db    = await _getDB();
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    return _wrap(store.delete(key));
}

/**
 * Atomic multi-write in a single transaction.
 * @param {Object} entries - { key: value, ... }
 */
async function _idbSetMany(entries) {
    const db  = await _getDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const st  = tx.objectStore(STORE_NAME);
    for (const [key, value] of Object.entries(entries)) {
        st.put(value, key);
    }
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
    });
}

/**
 * Return all keys that start with a given prefix.
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
async function _idbKeysByPrefix(prefix) {
    const db    = await _getDB();
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const allKeys = await _wrap(store.getAllKeys());
    return allKeys.filter(k => k.startsWith(prefix));
}

/**
 * Delete all keys that start with a given prefix (single transaction).
 * @param {string} prefix
 * @returns {Promise<number>} Number of deleted keys
 */
async function _idbDeleteByPrefix(prefix) {
    const keys = await _idbKeysByPrefix(prefix);
    if (keys.length === 0) return 0;

    const db  = await _getDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const st  = tx.objectStore(STORE_NAME);
    for (const key of keys) st.delete(key);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(keys.length);
        tx.onerror    = () => reject(tx.error);
    });
}

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

const Keys = {
    meta:            () => 'meta::saves',
    shared:  (save, k) => `save::${save}::${k}`,
    working: (save, k) => `save::${save}::working::${k}`,
    saved:   (save, k) => `save::${save}::saved::${k}`,
    savePrefix: (save) => `save::${save}::`,
};

// ---------------------------------------------------------------------------
// Save metadata helpers
// ---------------------------------------------------------------------------

/**
 * Read the saves metadata map.
 * Shape: { [saveName]: { cityCode, routeCount, day, stationCount } }
 */
async function _getMeta() {
    return (await _idbGet(Keys.meta())) || {};
}

async function _setMeta(meta) {
    return _idbSet(Keys.meta(), meta);
}

// ---------------------------------------------------------------------------
// Public Storage class
// ---------------------------------------------------------------------------

export class Storage {
    constructor(saveName = null) {
        this.saveName = saveName;
    }

    // ── Core read/write ────────────────────────────────────────────────────

    /**
     * Get a value from the current save's storage.
     *
     * SHARED keys (historicalData)     → read from shared slot
     * TRANSACTIONAL keys (everything else) → read from working slot
     *
     * @param {string} key
     * @param {*} defaultValue
     * @returns {Promise<*>}
     */
    async get(key, defaultValue) {
        const save = this.saveName || 'NoName';

        const idbKey = SHARED_KEYS.includes(key)
            ? Keys.shared(save, key)
            : Keys.working(save, key);

        const value = await _idbGet(idbKey);
        return value !== null ? value : defaultValue;
    }

    /**
     * Write a value to the current save's storage.
     *
     * SHARED keys     → write to shared slot (no transactional split)
     * TRANSACTIONAL keys → write to working slot only
     *
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const save = this.saveName || 'NoName';

        const idbKey = SHARED_KEYS.includes(key)
            ? Keys.shared(save, key)
            : Keys.working(save, key);

        return _idbSet(idbKey, value);
    }

    /**
     * Delete a key from the current save.
     * @param {string} key
     */
    async delete(key) {
        const save = this.saveName || 'NoName';

        const idbKey = SHARED_KEYS.includes(key)
            ? Keys.shared(save, key)
            : Keys.working(save, key);

        return _idbDelete(idbKey);
    }

    /**
     * Return all logical keys stored for the current save.
     * Strips the IDB key prefix so callers get plain key names.
     * @returns {Promise<string[]>}
     */
    async keys() {
        const save   = this.saveName || 'NoName';
        const prefix = Keys.savePrefix(save);
        const rawKeys = await _idbKeysByPrefix(prefix);

        return rawKeys.map(k => {
            // Strip: save::{name}::(shared|working|saved)::
            const withoutPrefix = k.slice(prefix.length);
            const slashIdx      = withoutPrefix.indexOf('::');
            return slashIdx >= 0
                ? withoutPrefix.slice(slashIdx + 2)
                : withoutPrefix;
        });
    }

    // ── Transactional commit / rollback ────────────────────────────────────

    /**
     * COMMIT: copy working transactional keys → saved slot.
     * Also updates save metadata with current game state.
     *
     * @param {Object} api - SubwayBuilderAPI instance
     */
    async backup(api) {
        const save = this.saveName || 'NoName';

        // Read all transactional working values
        const workingEntries = {};
        for (const key of TRANSACTIONAL_KEYS) {
            const value = await _idbGet(Keys.working(save, key));
            if (value !== null) {
                workingEntries[Keys.saved(save, key)] = value;
            }
        }

        // Update metadata
        const cityCode   = api.utils.getCityCode?.() || null;
        const routes     = api.gameState.getRoutes();
        const stations   = api.gameState.getStations();
        const day        = api.gameState.getCurrentDay();

        const meta = await _getMeta();
        meta[save] = { cityCode, routeCount: routes.length, day, stationCount: stations.length };

        workingEntries[Keys.meta()] = meta;

        await _idbSetMany(workingEntries);
    }

    /**
     * ROLLBACK: copy saved transactional keys → working slot.
     * Prevents data leakage from a previous session.
     */
    async restore() {
        const save = this.saveName || 'NoName';
        const entries = {};
        let restoredCount = 0;

        for (const key of TRANSACTIONAL_KEYS) {
            const saved = await _idbGet(Keys.saved(save, key));
            if (saved !== null) {
                entries[Keys.working(save, key)] = saved;
                restoredCount++;
            }
        }

        if (restoredCount > 0) {
            await _idbSetMany(entries);
        }
    }

    // ── Metadata ───────────────────────────────────────────────────────────

    /**
     * Update the save name (switches storage context).
     * @param {string} newSaveName
     */
    setSaveName(newSaveName) {
        this.saveName = newSaveName;
    }

    // ── Save management (used by settings dialog) ──────────────────────────

    /**
     * Return all save metadata entries.
     * @returns {Promise<Object>} { [saveName]: { cityCode, routeCount, day, stationCount } }
     */
    static async getAllSaves() {
        return _getMeta();
    }

    /**
     * Delete a specific save and all its associated IDB keys.
     * @param {string} saveName
     */
    static async deleteSave(saveName) {
        await _idbDeleteByPrefix(Keys.savePrefix(saveName));

        // Remove from metadata
        const meta = await _getMeta();
        delete meta[saveName];
        await _setMeta(meta);
    }

    /**
     * Rename a save in metadata (used when a temp session ID gets a real name).
     * Does NOT copy IDB keys — call migrateKeys() if you need that.
     * @param {string} oldName
     * @param {string} newName
     */
    static async renameSave(oldName, newName) {
        const meta = await _getMeta();
        if (meta[oldName]) {
            meta[newName] = meta[oldName];
            delete meta[oldName];
            await _setMeta(meta);
        }
    }

    /**
     * Copy all IDB keys from one save name to another.
     * Used when a temp session ID is replaced by the real save name.
     * @param {string} oldName
     * @param {string} newName
     * @param {boolean} deleteOld - Whether to delete old keys after copy
     */
    static async migrateKeys(oldName, newName, deleteOld = false) {
        const db      = await _getDB();
        const oldPfx  = Keys.savePrefix(oldName);
        const newPfx  = Keys.savePrefix(newName);

        const allKeys = await _idbKeysByPrefix(oldPfx);
        if (allKeys.length === 0) return;

        // Read all old values
        const tx     = db.transaction(STORE_NAME, 'readonly');
        const store  = tx.objectStore(STORE_NAME);
        const pairs  = await Promise.all(
            allKeys.map(async k => [k, await _wrap(store.get(k))])
        );

        // Write under new prefix
        const newEntries = {};
        for (const [oldKey, value] of pairs) {
            if (value !== undefined) {
                const newKey = newPfx + oldKey.slice(oldPfx.length);
                newEntries[newKey] = value;
            }
        }
        await _idbSetMany(newEntries);

        // Optionally remove old keys
        if (deleteOld) {
            await _idbDeleteByPrefix(oldPfx);
        }
    }

    /**
     * Export a save's data as a plain JS object (for JSON download).
     * @param {string} saveName
     * @returns {Promise<Object>}
     */
    static async exportSave(saveName) {
        const prefix  = Keys.savePrefix(saveName);
        const rawKeys = await _idbKeysByPrefix(prefix);

        const db    = await _getDB();
        const tx    = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const data = {};
        await Promise.all(rawKeys.map(async k => {
            const shortKey = k.slice(prefix.length);
            data[shortKey] = await _wrap(store.get(k));
        }));

        return data;
    }

    /**
     * Import a save's data from a plain JS object (produced by exportSave).
     * Overwrites any existing data for that save name.
     * @param {string} saveName
     * @param {Object} data - Object with short keys (without save:: prefix)
     * @param {Object} metadata - { cityCode, routeCount, day, stationCount }
     */
    static async importSave(saveName, data, metadata) {
        const prefix  = Keys.savePrefix(saveName);
        const entries = {};

        for (const [shortKey, value] of Object.entries(data)) {
            entries[prefix + shortKey] = value;
        }

        await _idbSetMany(entries);

        // Update metadata
        const meta = await _getMeta();
        meta[saveName] = metadata;
        await _setMeta(meta);
    }

    /**
     * Estimate IndexedDB usage (Chrome/Electron only).
     * @returns {Promise<{usedMB: string, quotaMB: string, pct: string}|null>}
     */
    static async estimateUsage() {
        if (!navigator.storage?.estimate) return null;
        const { usage, quota } = await navigator.storage.estimate();
        return {
            usedMB:  (usage  / 1024 / 1024).toFixed(2),
            quotaMB: (quota  / 1024 / 1024).toFixed(0),
            pct:     ((usage / quota) * 100).toFixed(1) + '%',
        };
    }
}
