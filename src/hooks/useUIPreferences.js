// UI Preferences persistence helpers
// Provides simple async get/set for per-save UI control state.
//
// All preferences are stored under a single IDB key ('uiPreferences'),
// namespaced by component to avoid collisions and allow independent evolution.
//
// The key is registered as TRANSACTIONAL in storage.js, so it is automatically
// backed up on game-save and rolled back on game-load — keeping UI state in
// sync with the correct save file.
//
// ── Recommended usage pattern ──────────────────────────────────────────────
//
//   const storage = getStorage();
//   const prefsSaveable = React.useRef(false);
//
//   // Load once, when storage becomes available
//   React.useEffect(() => {
//       if (prefsSaveable.current) return;
//       if (!storage) return;
//       loadPrefs(storage, 'myComponent').then(prefs => {
//           if (prefs.someState !== undefined) setSomeState(prefs.someState);
//           prefsSaveable.current = true;
//       });
//   }, [storage]);
//
//   // Save whenever relevant state changes (guard skips until prefs are loaded)
//   React.useEffect(() => {
//       if (!prefsSaveable.current || !storage) return;
//       savePrefs(storage, 'myComponent', { someState, otherState });
//   }, [storage, someState, otherState]);

const STORAGE_KEY = 'uiPreferences';

/**
 * Load preferences for a given namespace.
 * Returns {} if nothing is stored yet or on any error.
 *
 * @param {Object} storage   - Storage instance from getStorage()
 * @param {string} namespace - Component-level namespace key (e.g. 'dashboardTable')
 * @returns {Promise<Object>}
 */
export async function loadPrefs(storage, namespace) {
    if (!storage) return {};
    try {
        const all = await storage.get(STORAGE_KEY, {});
        return (all && typeof all === 'object' && all[namespace]) ? all[namespace] : {};
    } catch (e) {
        console.warn('[AA] loadPrefs: failed to load for namespace:', namespace, e);
        return {};
    }
}

/**
 * Save preferences for a given namespace (read-modify-write).
 * Merges the new data into the top-level preferences object atomically.
 *
 * @param {Object} storage   - Storage instance from getStorage()
 * @param {string} namespace - Component-level namespace key
 * @param {Object} data      - Preferences object to store for this namespace
 * @returns {Promise<void>}
 */
export async function savePrefs(storage, namespace, data) {
    if (!storage) return;
    try {
        const all = await storage.get(STORAGE_KEY, {});
        const updated = { ...(all || {}), [namespace]: data };
        await storage.set(STORAGE_KEY, updated);
    } catch (e) {
        console.warn('[AA] savePrefs: failed to save for namespace:', namespace, e);
    }
}
