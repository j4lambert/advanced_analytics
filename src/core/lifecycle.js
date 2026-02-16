// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData } from '../metrics/historical-data.js';
import { recordConfigChange, captureInitialDayConfig } from '../metrics/train-config-tracking.js';

let storage = null;

// Global variable to track current save name
// Updated on game load/save events
let currentSaveName = null;

// Track last known train configurations for change detection
let lastTrainConfig = {};

// Track last hour to detect hour changes
let lastHour = null;

// Throttle config writes to prevent localStorage spam
let pendingConfigWrites = {};
let configWriteTimeout = null;

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
    
    let configCheckInterval = null;
    let lastTrainConfig = {};
    let lastHour = null;
    
    // Initialize monitoring on game init
    api.hooks.onGameInit(() => {
        console.log(`${CONFIG.LOG_PREFIX} Starting train configuration monitoring...`);
        
        configCheckInterval = setInterval(() => {
            if (!storage || api.gameState.isPaused()) return;
            
            const routes = api.gameState.getRoutes();
            const elapsedSeconds = api.gameState.getElapsedSeconds();
            const currentHour = Math.floor((elapsedSeconds % 86400) / 3600);
            const currentMinute = Math.floor((elapsedSeconds % 3600) / 60);
            
            routes.forEach(route => {
                const currentConfig = {
                    high: route.trainSchedule?.highDemand || 0,
                    medium: route.trainSchedule?.mediumDemand || 0,
                    low: route.trainSchedule?.lowDemand || 0
                };
                
                const lastConfig = lastTrainConfig[route.id];
                
                // Detect configuration change
                if (!lastConfig || hasConfigChanged(currentConfig, lastConfig)) {
                    // Write directly - no batching needed
                    recordConfigChange(route.id, currentHour, currentMinute, currentConfig, api, storage);
                    lastTrainConfig[route.id] = currentConfig;
                }
            });
            
            // Track hour changes (for potential future use)
            lastHour = currentHour;
        }, 500);
    });
    
    // Day change - capture historical data
    api.hooks.onDayChange(async (dayThatEnded) => {
        if (!storage) {
            console.warn(`${CONFIG.LOG_PREFIX} Storage not initialized, skipping data capture`);
            return;
        }
        
        // Capture initial configuration for the NEW day
        const currentDay = api.gameState.getCurrentDay();
        await captureInitialDayConfig(currentDay, api, storage);
        
        // Reset tracking for new day
        lastTrainConfig = {};
        
        // Process the day that ended
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
        
        // Reset tracking
        lastTrainConfig = {};
        lastHour = null;
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
    
    // Route created - mark as new and capture creation time
    api.hooks.onRouteCreated((route) => {
        if (!storage) return;
        
        const currentDay = api.gameState.getCurrentDay();
        const creationTime = api.gameState.getElapsedSeconds();
        setRouteStatus(route.id, 'new', currentDay, storage, creationTime);
        
        // Initialize config tracking for this route
        lastTrainConfig[route.id] = {
            high: route.trainSchedule?.highDemand || 0,
            medium: route.trainSchedule?.mediumDemand || 0,
            low: route.trainSchedule?.lowDemand || 0
        };
    });
    
    // Route deleted - mark as deleted
    api.hooks.onRouteDeleted((routeId, routeBullet) => {
        if (!storage) return;
        
        const currentDay = api.gameState.getCurrentDay();
        setRouteStatus(routeId, 'deleted', currentDay, storage);
        
        // Clean up config tracking
        delete lastTrainConfig[routeId];
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
 * @param {number} creationTime - Creation timestamp (elapsed seconds, optional)
 */
async function setRouteStatus(routeId, status, day, storage, creationTime = null) {
    const statuses = await storage.get('routeStatuses', {});
    
    if (status === 'new') {
        statuses[routeId] = {
            status: 'new',
            createdDay: day,
            creationTime: creationTime,  // Store creation timestamp for real-time tracking
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

/**
 * Record a config change (batched with throttling)
 * Accumulates changes and writes them in batches to reduce localStorage overhead
 */
function queueConfigChange(routeId, hour, minute, config, api, storage) {
    const currentDay = api.gameState.getCurrentDay();
    const timestamp = hour * 60 + minute;
    
    if (!pendingConfigWrites[currentDay]) {
        pendingConfigWrites[currentDay] = {};
    }
    if (!pendingConfigWrites[currentDay][routeId]) {
        pendingConfigWrites[currentDay][routeId] = [];
    }
    
    pendingConfigWrites[currentDay][routeId].push({
        timestamp,
        hour,
        minute,
        high: config.high,
        medium: config.medium,
        low: config.low
    });
    
    // Clear existing timeout
    if (configWriteTimeout) {
        clearTimeout(configWriteTimeout);
    }
    
    // Batch writes every 2 seconds
    configWriteTimeout = setTimeout(async () => {
        try {
            const configCache = await storage.get('configCache', {});
            
            // Merge pending writes
            Object.keys(pendingConfigWrites).forEach(day => {
                if (!configCache[day]) {
                    configCache[day] = {};
                }
                Object.keys(pendingConfigWrites[day]).forEach(rId => {
                    if (!configCache[day][rId]) {
                        configCache[day][rId] = [];
                    }
                    configCache[day][rId].push(...pendingConfigWrites[day][rId]);
                });
            });
            
            await storage.set('configCache', configCache);
            console.log(`${CONFIG.LOG_PREFIX} Wrote ${Object.keys(pendingConfigWrites).length} config changes to storage`);
            
            // Clear pending writes
            pendingConfigWrites = {};
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to write config changes:`, error);
        }
    }, 2000);
}

/**
 * Helper to detect config changes
 * @param {Object} config1 - First configuration
 * @param {Object} config2 - Second configuration
 * @returns {boolean} True if configurations differ
 */
function hasConfigChanged(config1, config2) {
    return config1.high !== config2.high ||
           config1.medium !== config2.medium ||
           config1.low !== config2.low;
}
