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
 * Find matching save in localStorage based on game state
 * Uses strict matching: name + cityCode + routeCount + day + stationCount must ALL match
 * 
 * @param {string} saveName - Save name from game
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {string|null} Matching save key or null if not found
 */
function findMatchingSave(saveName, api) {
    const storageData = storage.getStorage();
    const saves = storageData.saves || {};
    
    // Get current game state metadata
    const cityCode = api.utils.getCityCode?.() || null;
    const routes = api.gameState.getRoutes();
    const stations = api.gameState.getStations();
    const day = api.gameState.getCurrentDay();
    
    const gameMetadata = {
        cityCode: cityCode,
        routeCount: routes.length,
        day: day,
        stationCount: stations.length
    };
    
    // Find exact match
    for (const [key, saveData] of Object.entries(saves)) {
        // Check if name matches
        if (key !== saveName) continue;
        
        // Check if all metadata matches
        if (saveData.cityCode === gameMetadata.cityCode &&
            saveData.routeCount === gameMetadata.routeCount &&
            saveData.day === gameMetadata.day &&
            saveData.stationCount === gameMetadata.stationCount) {
            return key;
        }
    }
    
    return null;
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
    
    // Game loaded - restore from saved
    api.hooks.onGameLoaded(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} Game loaded: ${saveName}`);
        
        // Initialize/update storage with current save name
        storage = initStorage(saveName);
        
        // Try to find matching save in localStorage
        const matchingKey = findMatchingSave(saveName, api);
        
        if (matchingKey) {
            console.log(`${CONFIG.LOG_PREFIX} Found matching save: ${matchingKey}`);
            storage.setSaveName(matchingKey);
            currentSaveName = matchingKey;
        } else {
            console.log(`${CONFIG.LOG_PREFIX} No matching save found, using: ${saveName}`);
            currentSaveName = saveName;
        }
        
        // Restore from saved
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
        
        // Backup working data and update metadata
        await storage.backup(api);
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
            creationTime: creationTime,
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