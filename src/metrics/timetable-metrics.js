// Timetable Metrics — Pure Computation
// Snapshot metrics derived from getTrains() data. No side effects, no API calls.

import { CONFIG } from '../config.js';

/**
 * Compute headway regularity from futureCycleArrivalTimes across all trains.
 *
 * Collects all predicted arrival times at stop index 0 across every train,
 * sorts them, and measures the gaps between consecutive arrivals.
 * The coefficient of variation (CV = stdDev / mean) of these gaps indicates
 * how evenly trains are spaced: lower = more regular.
 *
 * @param {Train[]} trains - All trains on one route (pre-filtered by routeId)
 * @returns {{ meanHeadwaySec: number|null, cvHeadway: number|null, label: string }}
 */
export function computeHeadwayRegularity(trains) {
    if (trains.length < 2) {
        return { meanHeadwaySec: null, cvHeadway: null, label: 'N/A' };
    }

    // Collect all arrival times at stop 0 across all trains
    const allTimes = [];
    for (const train of trains) {
        const stop0 = train.timings?.[0];
        if (!stop0) continue;

        // Current-lap arrival if already visited
        if (stop0.arrivalTime != null) {
            allTimes.push(stop0.arrivalTime);
        }

        // Future cycle arrivals (6 values per train)
        if (stop0.futureCycleArrivalTimes) {
            allTimes.push(...stop0.futureCycleArrivalTimes);
        }
    }

    if (allTimes.length < 2) {
        return { meanHeadwaySec: null, cvHeadway: null, label: 'N/A' };
    }

    // Sort and compute consecutive gaps
    allTimes.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < allTimes.length; i++) {
        const gap = allTimes[i] - allTimes[i - 1];
        if (gap > 0) gaps.push(gap);
    }

    if (gaps.length === 0) {
        return { meanHeadwaySec: null, cvHeadway: null, label: 'N/A' };
    }

    const mean   = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    const cv     = mean > 0 ? stdDev / mean : 0;

    const { REGULAR, IRREGULAR } = CONFIG.HEADWAY_THRESHOLDS;
    let label;
    if (cv < REGULAR)        label = 'Regular';
    else if (cv < IRREGULAR) label = 'Irregular';
    else                     label = 'Bunching';

    return { meanHeadwaySec: mean, cvHeadway: cv, label };
}

/**
 * Compute schedule drift: adjustedExpected vs original expected arrival.
 *
 * A large positive drift means the game's real-time scheduler has absorbed
 * significant delay on this route — a proxy for structural route stress.
 *
 * @param {Train[]} trains - All trains on one route (pre-filtered by routeId)
 * @returns {{ meanDriftSec: number, maxDriftSec: number }}
 */
export function computeScheduleDrift(trains) {
    if (trains.length === 0) {
        return { meanDriftSec: 0, maxDriftSec: 0 };
    }

    let totalDrift = 0;
    let maxAbsDrift = 0;
    let count = 0;

    for (const train of trains) {
        if (!train.timings) continue;
        for (const stop of train.timings) {
            const drift = stop.adjustedExpectedArrivalTime - stop.expectedArrivalTime;
            totalDrift += drift;
            maxAbsDrift = Math.max(maxAbsDrift, Math.abs(drift));
            count++;
        }
    }

    return {
        meanDriftSec: count > 0 ? totalDrift / count : 0,
        maxDriftSec:  maxAbsDrift,
    };
}
