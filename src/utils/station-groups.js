// station-groups.js
// Utility accessors for station groups, transfer hubs, and sibling lookups.
// Replaces the Zustand-based workarounds previously in src/core/api-support.js
// now that gameState.getStationGroups / getSiblingStationIds are stable (v1.3.0+).

const _gs = () => window.SubwayBuilderAPI.gameState;

/**
 * All station groups from the game state.
 * A group represents a physical location hub; groups with >1 stationId are transfer hubs.
 *
 * @returns {Array<{ id: string, stationIds: string[], name: string, center: number[], bounds: Object }>}
 */
export function getStationGroups() {
    return _gs().getStationGroups() ?? [];
}

/**
 * Station groups that contain more than one station (i.e. actual transfer hubs).
 *
 * @returns {Array}
 */
export function getTransferGroups() {
    return getStationGroups().filter(g => g.stationIds.length > 1);
}

/**
 * The group that contains the given station, or null if not found.
 *
 * @param {string} stationId
 * @returns {Object|null}
 */
export function getGroupForStation(stationId) {
    return getStationGroups().find(g => g.stationIds.includes(stationId)) ?? null;
}

/**
 * All other station IDs in the same group as the given station.
 * Returns an empty array if the station is alone or not in any group.
 *
 * @param {string} stationId
 * @returns {string[]}
 */
export function getSiblingStationIds(stationId) {
    return _gs().getSiblingStationIds(stationId) ?? [];
}
