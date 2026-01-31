// Historical data management module
// Captures and retrieves historical route data

import { CONFIG } from '../config.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from './route-metrics.js';
import { calculateTransfers } from './transfers.js';

/**
 * Capture current route data as historical snapshot
 * Called at end of each day
 * 
 * @param {number} day - Day number that just ended
 * @param {Object} api - SubwayBuilderAPI instance
 * @param {Object} storage - Storage instance
 * @returns {Promise<void>}
 */
export async function captureHistoricalData(day, api, storage) {
    try {
        const routes = api.gameState.getRoutes();
        const trainTypes = api.trains.getTrainTypes();
        const lineMetrics = api.gameState.getLineMetrics();
        const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;

        // Calculate transfers for all routes
        const transfersMap = calculateTransfers(routes, api);

        const processedData = [];

        routes.forEach(route => {
            const metrics = lineMetrics.find(m => m.routeId === route.id);
            const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
            const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
            const dailyRevenue = revenuePerHour * 24;

            if (!validateRouteData(route)) {
                processedData.push({
                    id: route.id,
                    name: route.name || route.bullet,
                    ridership,
                    dailyRevenue,
                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                    ...getEmptyMetrics()
                });
                return;
            }

            const trainType = trainTypes[route.trainType];
            if (!trainType) {
                processedData.push({
                    id: route.id,
                    name: route.name || route.bullet,
                    ridership,
                    dailyRevenue,
                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                    ...getEmptyMetrics()
                });
                return;
            }

            const calculatedMetrics = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
            
            processedData.push({
                id: route.id,
                name: route.name || route.bullet,
                ridership,
                dailyRevenue,
                transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                ...calculatedMetrics
            });
        });

        // Load existing historical data
        const historicalData = await storage.get('historicalData', { days: {} });
        
        // Store snapshot for this day
        historicalData.days[day] = {
            timestamp: Date.now(),
            routes: processedData
        };

        // Save to storage
        await storage.set('historicalData', historicalData);
        
        console.log(`${CONFIG.LOG_PREFIX} Captured data for Day ${day}: ${processedData.length} routes`);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to capture historical data:`, error);
    }
}

/**
 * Load all historical data from storage
 * @param {Object} storage - Storage instance
 * @returns {Promise<Object>} Historical data object
 */
export async function loadHistoricalData(storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const dayCount = Object.keys(historicalData.days).length;
        console.log(`${CONFIG.LOG_PREFIX} Loaded historical data: ${dayCount} days`);
        return historicalData;
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to load historical data:`, error);
        return { days: {} };
    }
}

/**
 * Get route data for a specific day
 * @param {number} day - Day number
 * @param {Object} historicalData - Historical data object
 * @returns {Array|null} Array of route data or null if day not found
 */
export function getDataForDay(day, historicalData) {
    const dayData = historicalData.days[day];
    if (!dayData || !dayData.routes) {
        return null;
    }
    return dayData.routes;
}

/**
 * Clear old historical data to prevent storage bloat
 * Keeps only the most recent N days
 * @param {number} daysToKeep - Number of days to retain
 * @param {Object} storage - Storage instance
 * @returns {Promise<void>}
 */
export async function pruneHistoricalData(daysToKeep, storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const days = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
        
        if (days.length <= daysToKeep) {
            return; // Nothing to prune
        }
        
        // Keep only recent days
        const daysToDelete = days.slice(daysToKeep);
        daysToDelete.forEach(day => {
            delete historicalData.days[day];
        });
        
        await storage.set('historicalData', historicalData);
        console.log(`${CONFIG.LOG_PREFIX} Pruned ${daysToDelete.length} old days, keeping ${daysToKeep} most recent`);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to prune historical data:`, error);
    }
}
