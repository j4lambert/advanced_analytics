// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData } from '../metrics/historical-data.js';

let storage = null;

// Global variable to track current save name
// Updated on game load/save events
let currentSaveName = null;

/**
 * Initialize the storage instance
 * @param {string} saveName - Current save name
 */
function initStorage(saveName) {
    if (!storage) {
        storage = new Storage(saveName);
    } else {
        storage.setSaveName(saveName);
    }
    currentSaveName = saveName;
    return storage;
}

/**
 * Get current save name (for use by UI components)
 * @returns {string|null} Current save name or null if not set
 */
export function getCurrentSaveName() {
    return currentSaveName;
}

/**
 * Initialize all lifecycle hooks
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initLifecycleHooks(api) {
    console.log(`${CONFIG.LOG_PREFIX} Setting up lifecycle hooks...`);
    
    // Day change - capture historical data
    api.hooks.onDayChange(async (dayThatEnded) => {
        if (!storage) {
            console.warn(`${CONFIG.LOG_PREFIX} Storage not initialized, skipping data capture`);
            return;
        }
        
        await captureHistoricalData(dayThatEnded, api, storage);
        
        // Transition all 'new' routes to 'ongoing' at day change
        await transitionNewRoutesToOngoing(storage);
    });
    
    // Game loaded - restore from backup
    api.hooks.onGameLoaded(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} Game loaded: ${saveName}`);
        
        // Initialize/update storage with current save name
        storage = initStorage(saveName);
        
        // Restore from backup
        await storage.restore();
    });
    
    // Game saved - backup data
    api.hooks.onGameSaved(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} Game saved: ${saveName}`);
        
        if (!storage) {
            storage = initStorage(saveName);
        }
        
        const oldSaveName = storage.saveName;
        
        // If save name changed, migrate the data
        if (oldSaveName && oldSaveName !== saveName) {
            const storageData = storage.getStorage();
            
            if (storageData.saves[oldSaveName]) {
                // Move data from old save to new save name
                storageData.saves[saveName] = storageData.saves[oldSaveName];
                
                // Only delete old save if it was a temp ID (contains timestamp)
                if (oldSaveName.match(/\d{13}/)) {
                    delete storageData.saves[oldSaveName];
                    console.log(`${CONFIG.LOG_PREFIX} Migrated data from temp save "${oldSaveName}" to: "${saveName}"`);
                } else {
                    console.log(`${CONFIG.LOG_PREFIX} Copied data from "${oldSaveName}" to: "${saveName}"`);
                }
                
                storage.setStorage(storageData);
            }
        }
        
        storage.setSaveName(saveName);
        currentSaveName = saveName;
        
        // Backup working data
        await storage.backup();
    });
    
    // Route created - mark as new
    api.hooks.onRouteCreated((route) => {
        if (!storage) return;
        
        const currentDay = api.gameState.getCurrentDay();
        setRouteStatus(route.id, 'new', currentDay, storage);
    });
    
    // Route deleted - mark as deleted
    api.hooks.onRouteDeleted((routeId, routeBullet) => {
        if (!storage) return;
        
        const currentDay = api.gameState.getCurrentDay();
        setRouteStatus(routeId, 'deleted', currentDay, storage);
    });
    
    console.log(`${CONFIG.LOG_PREFIX} ✓ Lifecycle hooks registered`);
}

/**
 * Get storage instance (for use by other modules)
 * @returns {Storage|null} Storage instance or null if not initialized
 */
export function getStorage() {
    return storage;
}

/**
 * Set route status
 * @param {string} routeId - Route ID
 * @param {string} status - Status ('new', 'ongoing', 'deleted')
 * @param {number} day - Current day
 * @param {Storage} storage - Storage instance
 */
async function setRouteStatus(routeId, status, day, storage) {
    const statuses = await storage.get('routeStatuses', {});
    
    if (status === 'new') {
        statuses[routeId] = {
            status: 'new',
            createdDay: day,
            deletedDay: null
        };
    } else if (status === 'ongoing') {
        if (statuses[routeId]) {
            statuses[routeId].status = 'ongoing';
        }
    } else if (status === 'deleted') {
        if (statuses[routeId]) {
            statuses[routeId].status = 'deleted';
            statuses[routeId].deletedDay = day;
        }
    }
    
    await storage.set('routeStatuses', statuses);
}

/**
 * Transition all 'new' routes to 'ongoing' status
 * Called at day change
 * @param {Storage} storage - Storage instance
 */
async function transitionNewRoutesToOngoing(storage) {
    const statuses = await storage.get('routeStatuses', {});
    let updated = false;
    
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
