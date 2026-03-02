// Transfer calculation module
// Calculates transfer connections between routes for the analytics table.
//
// Transfer detection (both paths):
//   1. Shared station:    station.routeIds has more than one route → direct transfer
//   2. Zustand primary:  getSiblingStationIds() → stations in the same group
//   3. Fallback:         nearbyStations walkingTime heuristic
//
// Result shape per route:
// {
//   count:      number,   // total transfer-station count across all connected routes
//   routes:     string[], // display names of connected routes
//   routeIds:   string[], // IDs of connected routes
//   stationIds: string[]  // IDs of this route's stations that are transfer points
// }

import { CONFIG } from '../config.js';
import {
    isZustandAvailable,
    getSiblingStationIds,
} from '../core/api-support.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate transfer connections for every route.
 *
 * @param {Array}  routes - Array of route objects from api.gameState.getRoutes()
 * @param {Object} api    - SubwayBuilderAPI instance
 * @returns {Object} Map of routeId -> { count, routes, routeIds, stationIds }
 */
export function calculateTransfers(routes, api) {
    return isZustandAvailable()
        ? _calculateTransfersZustand(routes, api)
        : _calculateTransfersFallback(routes, api);
}

// ---------------------------------------------------------------------------
// Zustand-based implementation
// ---------------------------------------------------------------------------

/**
 * Uses stationGroups to identify transfer hubs.
 *
 * For each route, iterates its stations. A station is a transfer point when:
 *   - it is shared by multiple routes (station.routeIds.length > 1), OR
 *   - getSiblingStationIds() returns siblings served by a different route.
 *
 * @private
 */
function _calculateTransfersZustand(routes, api) {
    const allStations = api.gameState.getStations();
    const transferMap = {};

    routes.forEach(route => {
        // Map of otherRouteId -> Set of transfer station IDs on this route
        const transfersByRoute = new Map();

        // Find all stations belonging to this route
        allStations.forEach(station => {
            if (!station.routeIds?.includes(route.id)) return;

            // 1. Shared station: multiple routes stop here directly
            _addDirectRoutes(station, route.id, transfersByRoute);

            // 2. Sibling stations in the same group (Zustand)
            const siblingIds = getSiblingStationIds(station.id);
            siblingIds.forEach(sibId => {
                const sibling = allStations.find(s => s.id === sibId);
                if (!sibling?.routeIds) return;

                sibling.routeIds.forEach(otherRouteId => {
                    if (otherRouteId === route.id) return;

                    if (!transfersByRoute.has(otherRouteId)) {
                        transfersByRoute.set(otherRouteId, new Set());
                    }
                    transfersByRoute.get(otherRouteId).add(station.id);
                });
            });
        });

        transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });

    return transferMap;
}

// ---------------------------------------------------------------------------
// Fallback: original nearbyStations walking-time heuristic
// ---------------------------------------------------------------------------

/**
 * Fallback implementation using nearbyStations walking-time heuristic.
 * Also handles shared stations (routeIds.length > 1) just like the Zustand path.
 *
 * @private
 */
function _calculateTransfersFallback(routes, api) {
    const allStations = api.gameState.getStations();
    const THRESHOLD   = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;
    const transferMap = {};

    routes.forEach(route => {
        const transfersByRoute = new Map();

        allStations.forEach(station => {
            if (!station.routeIds?.includes(route.id)) return;

            // 1. Shared station: multiple routes stop here directly
            _addDirectRoutes(station, route.id, transfersByRoute);

            // 2. Nearby stations within walking threshold
            station.nearbyStations?.forEach(nearby => {
                if (nearby.walkingTime >= THRESHOLD) return;

                const nearbyStation = allStations.find(s => s.id === nearby.stationId);
                if (!nearbyStation?.routeIds) return;

                nearbyStation.routeIds.forEach(otherRouteId => {
                    if (otherRouteId === route.id) return;

                    if (!transfersByRoute.has(otherRouteId)) {
                        transfersByRoute.set(otherRouteId, new Set());
                    }
                    transfersByRoute.get(otherRouteId).add(station.id);
                });
            });
        });

        transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });

    return transferMap;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Register all routes that share `station` directly (station.routeIds.length > 1)
 * as transfer connections for the current route being processed.
 *
 * Mutates `transfersByRoute` in place.
 *
 * @param {Object}              station          - Station object with routeIds array
 * @param {string}              currentRouteId   - Route being processed (excluded)
 * @param {Map<string,Set>}     transfersByRoute - Accumulator map
 * @private
 */
function _addDirectRoutes(station, currentRouteId, transfersByRoute) {
    if (!station?.routeIds || station.routeIds.length <= 1) return;

    station.routeIds.forEach(otherRouteId => {
        if (otherRouteId === currentRouteId) return;

        if (!transfersByRoute.has(otherRouteId)) {
            transfersByRoute.set(otherRouteId, new Set());
        }
        transfersByRoute.get(otherRouteId).add(station.id);
    });
}

/**
 * Build the result object from a transfersByRoute map.
 *
 * @param {Map<string, Set<string>>} transfersByRoute
 * @param {Array} routes
 * @returns {{ count: number, routes: string[], routeIds: string[], stationIds: string[] }}
 * @private
 */
function _buildResult(transfersByRoute, routes) {
    let totalCount = 0;
    const connectedRouteData = [];
    const allStationIds = [];

    transfersByRoute.forEach((stationIdsSet, otherRouteId) => {
        const otherRoute  = routes.find(r => r.id === otherRouteId);
        const stationIds  = Array.from(stationIdsSet);
        totalCount += stationIds.length;
        connectedRouteData.push({
            routeId:     otherRouteId,
            routeName:   otherRoute ? (otherRoute.name || otherRoute.bullet) : otherRouteId,
            sharedCount: stationIds.length,
        });
        allStationIds.push(...stationIds);
    });

    // Sort by shared count desc, then alphabetically
    connectedRouteData.sort((a, b) =>
        b.sharedCount !== a.sharedCount
            ? b.sharedCount - a.sharedCount
            : a.routeName.localeCompare(b.routeName)
    );

    return {
        count:      totalCount,
        routes:     connectedRouteData.map(r => r.routeName),
        routeIds:   connectedRouteData.map(r => r.routeId),
        stationIds: allStationIds,
    };
}
