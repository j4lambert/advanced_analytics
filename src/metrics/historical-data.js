// Historical data management module
// Captures and retrieves historical route data

import { CONFIG } from '../config.js';
import { calculateDailyCostFromTimeline } from './train-config-tracking.js';
import { getRouteTodayStats, getTimetableAccum } from './accumulator.js';
import { getRouteStationsInOrder } from '../utils/route-utils.js';
import { getGroupForStation } from '../utils/station-groups.js';

/**
 * Compute a system-wide timetable adherence snapshot from the current accumulators.
 * Called just before resetTimetableAccum() so the day's data is still in memory.
 * Also used by system-stats for the live KPI card (via import).
 *
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {{ systemAdherenceScore: number|null, avgDelayByRoute: Object, avgDelayByHub: Object }}
 */
export function computeAdherenceSnapshot(api) {
    try {
        const routes = api.gameState.getRoutes();
        const { ON_TIME_SEC } = CONFIG.ADHERENCE_THRESHOLDS;
        let totalStops = 0;
        let onTimeStops = 0;
        const avgDelayByRoute = {};
        const hubAccum = {}; // groupId → { name, sumDelay, count }

        for (const route of routes) {
            const accum    = getTimetableAccum(route.id);
            const stations = getRouteStationsInOrder(route.id, api);
            let routeSum = 0, routeCount = 0;

            for (const station of stations) {
                const bucket = accum?.[station.stNodeId];
                if (!bucket || bucket.count === 0) continue;
                const delay = bucket.sumDelaySec / bucket.count;

                routeSum += delay;
                routeCount++;
                totalStops++;
                if (Math.abs(delay) <= ON_TIME_SEC) onTimeStops++;

                const group = getGroupForStation(station.id);
                if (group && group.stationIds.length > 1) {
                    if (!hubAccum[group.id]) {
                        hubAccum[group.id] = { name: group.name, sumDelay: 0, count: 0 };
                    }
                    hubAccum[group.id].sumDelay += delay;
                    hubAccum[group.id].count++;
                }
            }

            if (routeCount > 0) {
                avgDelayByRoute[route.id] = +(routeSum / routeCount).toFixed(1);
            }
        }

        const avgDelayByHub = {};
        for (const [groupId, hub] of Object.entries(hubAccum)) {
            avgDelayByHub[groupId] = +(hub.sumDelay / hub.count).toFixed(1);
        }

        return {
            systemAdherenceScore: totalStops > 0
                ? Math.round((onTimeStops / totalStops) * 100)
                : null,
            avgDelayByRoute,
            avgDelayByHub,
        };
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} computeAdherenceSnapshot failed:`, e);
        return { systemAdherenceScore: null, avgDelayByRoute: {}, avgDelayByHub: {} };
    }
}

/**
 * Capture a day's route data as a historical snapshot.
 * Called at end of each day from lifecycle.js onDayChange.
 *
 * The caller (lifecycle.js) already computed per-route stats via
 * getRoute24hStats(), so this function just formats and persists them.
 *
 * @param {number} day           - In-game day number that just ended
 * @param {Object} api           - SubwayBuilderAPI instance
 * @param {Object} storage       - Storage instance
 * @param {Object} routeStatsMap - { [routeId]: statsFromGetRoute24hStats }
 * @param {Object} configCache   - In-memory config cache snapshot for scheduleChangedAt detection
 * @returns {Promise<void>}
 */
export async function captureHistoricalData(day, api, storage, routeStatsMap = {}, configCache = {}, adherenceSnapshot = null) {
    try {
        const routes     = api.gameState.getRoutes();
        const trainTypes = api.trains.getTrainTypes();

        const processedData = routes.map(route => {
            const stats   = routeStatsMap[route.id] || {};
            const history = configCache[day]?.[route.id] || [];
            // Entries with timestamp > 0 are mid-day changes (0 = midnight baseline)
            const changes = history.filter(e => e.timestamp > 0);

            // Compute cost from the config timeline — more accurate than the
            // event-log approach because it covers exactly midnight-to-midnight
            // and accounts for every schedule change to the minute.
            const trainType    = trainTypes[route.trainType];
            const carsPerTrain = route.carsPerTrain ?? trainType?.stats.carsPerCarSet ?? 1;
            const timelineCost = trainType
                ? calculateDailyCostFromTimeline(route.id, history, trainType, carsPerTrain)
                : null;

            const dailyCost      = timelineCost ?? stats.dailyCost ?? 0;
            const dailyRevenue   = stats.dailyRevenue ?? 0;
            const dailyProfit    = dailyRevenue - dailyCost;
            const totalTrains    = stats.totalTrains ?? 0;
            const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;

            return {
                id:      route.id,
                name:    route.name || route.bullet,
                deleted: false,
                scheduleChangedAt: changes.length > 0 ? changes.map(e => e.timestamp) : null,
                // Spread all precomputed stats (dailyRevenue, dailyCost, dailyProfit,
                // capacity, utilization, ridership, transfers, trains*, stations, etc.)
                ...stats,
                // Override cost-derived fields with the timeline-accurate values.
                dailyCost,
                dailyProfit,
                profitPerTrain,
            };
        });

        // Load existing historical data
        const historicalData = await storage.get('historicalData', { days: {} });

        // Store snapshot for this day
        historicalData.days[day] = {
            timestamp:            Date.now(),
            routes:               processedData,
            systemAdherenceScore: adherenceSnapshot?.systemAdherenceScore ?? null,
            avgDelayByRoute:      adherenceSnapshot?.avgDelayByRoute ?? {},
            avgDelayByHub:        adherenceSnapshot?.avgDelayByHub ?? {},
        };

        await storage.set('historicalData', historicalData);
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
 * Total profit for a route since it entered service.
 *
 * Sums the midnight-to-midnight daily snapshots for each completed day,
 * then adds today's clean slice (midnight → now) from getRouteTodayStats().
 * The two ranges share no overlap.
 *
 * Key convention (discovered via debug): onDayChange(N) receives the *new* day
 * number, so captureHistoricalData stores the snapshot under days[N] — meaning
 * days[N] holds data from day N-1. Completed-day data for a route created on
 * `createdDay` therefore lives in days[createdDay+1 … currentDay] inclusive.
 *
 * @param {string} routeId       - Route ID
 * @param {number} createdDay    - In-game day the route was created
 * @param {Object} historicalData - { days: { [day]: { routes: [...] } } }
 * @param {number} currentDay    - Current in-game day
 * @returns {number} Cumulative profit (can be negative)
 */
export function getRouteLifetimeProfit(routeId, createdDay, historicalData, currentDay) {
    // Key convention (game v1.3.0+): onDayChange(N) fires with N = the day that
    // just closed. captureHistoricalData stores the snapshot at days[N], so
    // days[N] holds data for game day N.
    //
    // createdDay is stored as getCurrentDay() at route creation (UI day, 1-based).
    // The route's first *full* day snapshot lives at days[createdDay+1] (the day
    // after creation). The upper bound currentDay is the in-progress day whose
    // key doesn't exist yet and is gracefully skipped by the null-check below.
    let total = 0;
    for (let day = createdDay + 1; day <= currentDay; day++) {
        const dayData = historicalData?.days[day];
        if (!dayData?.routes) continue;
        const route = dayData.routes.find(r => r.id === routeId);
        total += route?.dailyProfit ?? 0;
    }
    // Add today's clean slice (midnight → now) — no overlap with completed snapshots.
    return total + getRouteTodayStats(routeId).dailyProfit;
}

/**
 * Clear old historical data to prevent storage bloat.
 * Keeps only the most recent N days.
 *
 * @param {number} daysToKeep - Number of days to retain
 * @param {Object} storage    - Storage instance
 * @returns {Promise<void>}
 */
export async function pruneHistoricalData(daysToKeep, storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const days = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);

        if (days.length <= daysToKeep) {
            return; // Nothing to prune
        }

        const daysToDelete = days.slice(daysToKeep);
        daysToDelete.forEach(day => {
            delete historicalData.days[day];
        });

        await storage.set('historicalData', historicalData);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to prune historical data:`, error);
    }
}
