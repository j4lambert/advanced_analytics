// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData } from '../metrics/historical-data.js';
import { getZustandSaveName } from './api-support.js';
import {
    initAccumulator,
    stopAccumulating,
    clearAccumulatorState,
    persistEvents,
    restoreEvents,
    getRoute24hStats,
} from '../metrics/accumulator.js';

let storage = null;

// Global variable to track current save name
let currentSaveName = null;

// ── Demand phase helpers ───────────────────────────────────────────────────

const _HIGH_PHASE_KEYS = new Set(['PeakMorningRush', 'PeakEveningRush']);
const _LOW_PHASE_KEYS  = new Set(['LateNight', 'Night', 'Evening']);

function _applyDemandPhasesFromAPI(api) {
    if (!api.popTiming?.getCommuteTimeRanges) return;
    try {
        const ranges = api.popTiming.getCommuteTimeRanges();
        if (!ranges?.length) return;

        CONFIG.DEMAND_PHASES = ranges.map(r => {
            let type;
            if      (_HIGH_PHASE_KEYS.has(r.key)) type = 'high';
            else if (_LOW_PHASE_KEYS.has(r.key))  type = 'low';
            else                                   type = 'medium';
            return { type, startHour: r.start, endHour: r.end, name: r.name };
        });

        const hours = { high: 0, medium: 0, low: 0 };
        for (const p of CONFIG.DEMAND_PHASES) hours[p.type] += (p.endHour - p.startHour);
        CONFIG.DEMAND_HOURS = hours;

        console.log(`${CONFIG.LOG_PREFIX} Demand phases loaded from API:`, CONFIG.DEMAND_PHASES);
    } catch (e) {
        console.warn(`${CONFIG.LOG_PREFIX} Could not load demand phases from API, using defaults:`, e);
    }
}

export function getCurrentPhaseName() {
    const elapsed     = window.SubwayBuilderAPI.gameState.getElapsedSeconds();
    const currentHour = Math.floor((elapsed % 86400) / 3600);
    const phase       = CONFIG.DEMAND_PHASES.find(
        p => currentHour >= p.startHour && currentHour < p.endHour
    );
    return phase?.name ?? null;
}

/**
 * Fallback handler for subsequent loads where onGameLoaded does not fire.
 *
 * API bug: after the first session load, onGameLoaded and onGameInit are never
 * triggered again. onMapReady is the only reliable hook on subsequent loads.
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export async function handleMapReadyFallback(api) {
    const zustandName  = getZustandSaveName();
    const resolvedName = zustandName || `session_${Date.now()}`;
    const source       = zustandName ? 'Zustand' : 'temp ID';

    storage = _initStorage(resolvedName);

    const matchingKey = await _findMatchingSave(resolvedName, api);

    if (matchingKey) {
        storage.setSaveName(matchingKey);
        currentSaveName = matchingKey;
    } else {
        currentSaveName = resolvedName;
    }

    await storage.restore();
    await _runMigrations(currentSaveName, storage);

    // Prune historical entries that belong to days in the future
    // (can appear when a save file is rewound to an earlier day)
    await _pruneFutureHistoricalData(storage, api);

    _applyDemandPhasesFromAPI(api);

    // Accumulator: clear stale in-memory state, restore persisted events, restart
    clearAccumulatorState();
    await restoreEvents(storage, api.gameState.getElapsedSeconds());
    initAccumulator(api);
}

/**
 * Initialize (or reuse) the storage instance for a given save name.
 * @param {string} saveName
 * @returns {Storage}
 */
function _initStorage(saveName) {
    if (!storage) {
        storage = new Storage(saveName);
    } else {
        storage.setSaveName(saveName);
    }
    currentSaveName = saveName;
    return storage;
}

/**
 * Get current save name (for use by UI components).
 * @returns {string|null}
 */
export function getCurrentSaveName() {
    return currentSaveName;
}

/**
 * Find a matching save in IDB by comparing game state metadata.
 * Uses strict matching: name + cityCode + routeCount + day + stationCount must ALL match.
 *
 * @param {string} saveName - Save name from the game
 * @param {Object} api      - SubwayBuilderAPI instance
 * @returns {Promise<string|null>} Matching save key or null
 */
async function _findMatchingSave(saveName, api) {
    const saves = await Storage.getAllSaves();

    const cityCode    = api.utils.getCityCode?.() || null;
    const routes      = api.gameState.getRoutes();
    const stations    = api.gameState.getStations();
    const day         = api.gameState.getCurrentDay();

    for (const [key, saveData] of Object.entries(saves)) {
        if (key !== saveName) continue;

        if (saveData.cityCode     === cityCode        &&
            saveData.routeCount   === routes.length   &&
            saveData.day          === day              &&
            saveData.stationCount === stations.length) {
            return key;
        }
    }

    return null;
}

/**
 * Prune historical data entries that belong to days >= currentDay.
 * Prevents stale future-day data after a save file is rewound.
 *
 * @param {Object} storage - Storage instance
 * @param {Object} api     - SubwayBuilderAPI instance
 */
async function _pruneFutureHistoricalData(storage, api) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const currentDay     = api.gameState.getCurrentDay();
        let   pruned         = false;

        for (const day of Object.keys(historicalData.days)) {
            // Use strict greater-than: the current day may already have a completed
            // snapshot (onDayChange fires before getCurrentDay() advances), so we
            // must NOT prune it.  Only days strictly beyond currentDay are future
            // data that can appear after a save-rewind.
            if (parseInt(day) > currentDay) {
                delete historicalData.days[day];
                pruned = true;
            }
        }

        if (pruned) {
            await storage.set('historicalData', historicalData);
        }
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} [LC] Failed to prune future historical data:`, e);
    }
}

/**
 * Initialize all lifecycle hooks.
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initLifecycleHooks(api) {

    // ── onGameInit ──────────────────────────────────────────────────────────
    api.hooks.onGameInit(() => {
        _applyDemandPhasesFromAPI(api);
        // New game: no persisted events to restore
        clearAccumulatorState();
        initAccumulator(api);
    });

    // ── onGameLoaded ────────────────────────────────────────────────────────
    api.hooks.onGameLoaded(async (saveName) => {

        storage = _initStorage(saveName);

        const matchingKey = await _findMatchingSave(saveName, api);

        if (matchingKey) {
            storage.setSaveName(matchingKey);
            currentSaveName = matchingKey;
        } else {
            currentSaveName = saveName;
        }

        await storage.restore();
        await _runMigrations(currentSaveName, storage);

        // Prune stale future-day historical data
        await _pruneFutureHistoricalData(storage, api);

        _applyDemandPhasesFromAPI(api);

        // Accumulator: discard stale data, restore from IDB, restart
        clearAccumulatorState();
        await restoreEvents(storage, api.gameState.getElapsedSeconds());
        initAccumulator(api);
    });

    // ── onGameSaved ─────────────────────────────────────────────────────────
    api.hooks.onGameSaved(async (saveName) => {

        if (!storage) {
            storage = _initStorage(saveName);
        }

        const oldSaveName = storage.saveName;

        // Migrate keys if the save was previously stored under a temp/different name
        if (oldSaveName && oldSaveName !== saveName) {
            const isTempId = /\d{13}/.test(oldSaveName);

            await Storage.migrateKeys(oldSaveName, saveName, isTempId);
            await Storage.renameSave(oldSaveName, saveName);
        }

        storage.setSaveName(saveName);
        currentSaveName = saveName;

        await storage.backup(api);
        await persistEvents(storage);
    });

    // ── onGameEnd ───────────────────────────────────────────────────────────
    api.hooks.onGameEnd((result) => {
        storage         = null;
        currentSaveName = null;

        stopAccumulating();
    });

    // ── onDayChange ─────────────────────────────────────────────────────────
    api.hooks.onDayChange(async (dayThatEnded) => {

        if (!storage) {
            console.warn(`${CONFIG.LOG_PREFIX} Storage not initialized, skipping data capture`);
            return;
        }

        // Build stats snapshot for each active route using the rolling 24h window.
        // At the day boundary, the rolling window covers exactly the day that just ended.
        const routes = api.gameState.getRoutes();
        const routeStatsMap = {};
        routes.forEach(route => {
            routeStatsMap[route.id] = getRoute24hStats(route.id);
        });

        // Persist event log before the new day continues accumulating
        await persistEvents(storage);

        // Save historical snapshot for the day that ended
        await captureHistoricalData(dayThatEnded, api, storage, routeStatsMap);

        // Transition 'new' routes to 'ongoing' status
        await _transitionNewRoutesToOngoing(storage);
    });

    // ── onRouteCreated ──────────────────────────────────────────────────────
    api.hooks.onRouteCreated((route) => {
        if (!storage) return;

        const currentDay   = api.gameState.getCurrentDay();
        const creationTime = api.gameState.getElapsedSeconds();
        _setRouteStatus(route.id, 'new', currentDay, storage, creationTime);
    });

    // ── onRouteDeleted ──────────────────────────────────────────────────────
    api.hooks.onRouteDeleted((routeId) => {
        if (!storage) return;

        const currentDay = api.gameState.getCurrentDay();
        _setRouteStatus(routeId, 'deleted', currentDay, storage);
    });
}

/**
 * Get the active storage instance (for use by UI components and hooks).
 * @returns {Storage|null}
 */
export function getStorage() {
    return storage;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Set route lifecycle status in storage.
 */
async function _setRouteStatus(routeId, status, day, storage, creationTime = null) {
    const statuses = await storage.get('routeStatuses', {});

    if (status === 'new') {
        statuses[routeId] = {
            status:       'new',
            createdDay:   day,
            creationTime: creationTime,
            deletedDay:   null,
        };
    } else if (status === 'ongoing') {
        if (statuses[routeId]) {
            statuses[routeId].status = 'ongoing';
        }
    } else if (status === 'deleted') {
        if (statuses[routeId]) {
            statuses[routeId].status     = 'deleted';
            statuses[routeId].deletedDay = day;
        }
    }

    await storage.set('routeStatuses', statuses);
}

/**
 * Run data migrations for a save that was last written by an older mod version.
 *
 * Called once after restore() on every game load, before any other processing.
 * Read the stored modVersion from metadata, compare to __MOD_VERSION__, and
 * apply any necessary transformations to persisted data.
 *
 * Pattern for future migrations:
 *   if (!storedVersion || compareVersions(storedVersion, '2.0.0') < 0) {
 *       await _migrateToV2(storage);
 *   }
 *
 * @param {string} saveName
 * @param {Object} storageInstance
 */
async function _runMigrations(saveName, storageInstance) {
    try {
        const saves         = await Storage.getAllSaves();
        const storedVersion = saves[saveName]?.modVersion ?? null;

        if (storedVersion === __MOD_VERSION__) return;  // nothing to do

        // ── Future migration blocks go here ─────────────────────────────────
        // Example:
        // if (!storedVersion || compareVersions(storedVersion, '2.0.0') < 0) {
        //     await _migrateToV2(storageInstance);
        // }
        // ────────────────────────────────────────────────────────────────────

        if (storedVersion !== __MOD_VERSION__) {
            console.log(`${CONFIG.LOG_PREFIX} [Migration] ${storedVersion ?? 'pre-versioning'} → ${__MOD_VERSION__} (no data changes needed)`);
        }
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} [Migration] Failed:`, e);
    }
}

/**
 * Transition all 'new' routes to 'ongoing' at day change.
 */
async function _transitionNewRoutesToOngoing(storage) {
    const statuses = await storage.get('routeStatuses', {});
    let updated    = false;

    for (const routeId in statuses) {
        if (statuses[routeId].status === 'new') {
            statuses[routeId].status = 'ongoing';
            updated = true;
        }
    }

    if (updated) {
        await storage.set('routeStatuses', statuses);
    }
}
