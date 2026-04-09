// Transfer utilities
// Helper functions for resolving transfer connections at a specific station.
// Uses gameState.getSiblingStationIds() via station-groups.js (v1.3.0+).

import { CONFIG } from '../config.js';
import { getSiblingStationIds } from './station-groups.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get transfer route info for a specific station.
 *
 * Returns all routes (excluding currentRouteId) that connect to this station
 * via the same station group (gameState API).
 *
 * @param {string} stationId       - The station to check
 * @param {string} currentRouteId  - The route currently being viewed (excluded)
 * @param {Object} api             - SubwayBuilderAPI instance
 * @returns {Array<{ routeId: string, routeName: string, bullet: string }>}
 */
export function getStationTransferRoutes(stationId, currentRouteId, api) {
    return _getTransferRoutes(stationId, currentRouteId, api);
}

// ---------------------------------------------------------------------------

/**
 * Uses getSiblingStationIds() to find co-located stations and resolves their routes.
 *
 * A station is a transfer if it shares a group with at least one other station.
 * We collect all routes served by sibling stations (excluding currentRouteId).
 *
 * @private
 */
function _getTransferRoutes(stationId, currentRouteId, api) {
    try {
        const allStations = api.gameState.getStations();
        const allRoutes   = api.gameState.getRoutes();

        const siblingIds = getSiblingStationIds(stationId);
        if (siblingIds.length === 0) return [];

        const transferRouteIds = new Set();

        for (const sibId of siblingIds) {
            const sib = allStations.find(s => s.id === sibId);
            if (!sib?.routeIds) continue;

            for (const routeId of sib.routeIds) {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            }
        }

        // Also include other routes served directly at this station
        const thisStation = allStations.find(s => s.id === stationId);
        if (thisStation?.routeIds) {
            for (const routeId of thisStation.routeIds) {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            }
        }

        return _resolveRouteIds(transferRouteIds, allRoutes);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} [TransferUtils] Error:`, error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a Set of route IDs to route descriptor objects.
 *
 * @param {Set<string>} routeIdSet
 * @param {Array}       allRoutes
 * @returns {Array<{ routeId: string, routeName: string, bullet: string }>}
 * @private
 */
function _resolveRouteIds(routeIdSet, allRoutes) {
    return Array.from(routeIdSet)
        .map(routeId => {
            const route = allRoutes.find(r => r.id === routeId);
            if (!route) return null;
            return {
                routeId,
                routeName: route.name || route.bullet || routeId,
                bullet:    route.bullet || '?',
            };
        })
        .filter(Boolean);
}
