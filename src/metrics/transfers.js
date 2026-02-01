// Transfer calculation module
// Calculates transfer connections between routes

import { CONFIG } from '../config.js';

/**
 * Calculate transfer connections using nearbyStations with walkingTime
 * WORKAROUND for API bug where routeIds always returns single ID
 * 
 * A station is considered a transfer if:
 * - It has nearbyStations with walkingTime < threshold seconds
 * - The nearby station belongs to a different route
 * 
 * @param {Array} routes - Array of route objects
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {Object} Map of routeId -> { count, routes, stationIds }
 */
export function calculateTransfers(routes, api) {
    const stations = api.gameState.getStations();
    const WALKING_TIME_THRESHOLD = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;
    
    // Build transfer map for each route
    const transferMap = {};
    
    routes.forEach(route => {
        // Map of otherRouteId -> Set of transfer station IDs
        const transfersByRoute = new Map();
        
        // Find all stations that belong to this route
        stations.forEach(station => {
            // Check if this station belongs to the current route
            if (!station.routeIds || !station.routeIds.includes(route.id)) return;
            if (!station.nearbyStations || station.nearbyStations.length === 0) return;
            
            // Check nearby stations for transfers
            station.nearbyStations.forEach(nearby => {
                // Filter by walking time threshold
                if (nearby.walkingTime >= WALKING_TIME_THRESHOLD) return;
                
                // Find the nearby station to get its route
                const nearbyStation = stations.find(s => s.id === nearby.stationId);
                if (!nearbyStation || !nearbyStation.routeIds) return;
                
                // Check if nearby station belongs to a different route
                nearbyStation.routeIds.forEach(otherRouteId => {
                    // Skip if it's the same route (no self-transfers)
                    if (otherRouteId === route.id) return;
                    
                    // Found a transfer!
                    if (!transfersByRoute.has(otherRouteId)) {
                        transfersByRoute.set(otherRouteId, new Set());
                    }
                    transfersByRoute.get(otherRouteId).add(station.id);
                });
            });
        });
        
        // Build the result
        let totalCount = 0;
        const connectedRouteData = [];
        const allStationIds = [];
        
        transfersByRoute.forEach((stationIdsSet, otherRouteId) => {
            const otherRoute = routes.find(r => r.id === otherRouteId);
            const stationIds = Array.from(stationIdsSet);
            totalCount += stationIds.length;
            connectedRouteData.push({
                routeId: otherRouteId,
                routeName: otherRoute ? (otherRoute.name || otherRoute.bullet) : otherRouteId,
                sharedCount: stationIds.length
            });
            allStationIds.push(...stationIds);
        });
        
        // Sort by shared count (descending), then alphabetically
        connectedRouteData.sort((a, b) => {
            if (b.sharedCount !== a.sharedCount) {
                return b.sharedCount - a.sharedCount;
            }
            return a.routeName.localeCompare(b.routeName);
        });
        
        transferMap[route.id] = {
            count: totalCount,
            routes: connectedRouteData.map(r => r.routeName),
            routeIds: connectedRouteData.map(r => r.routeId),
            stationIds: allStationIds
        };
    });
    
    return transferMap;
}
