// Route utilities
// Helper functions for working with route data

/**
 * Get stations for a route in timetable order, deduplicated.
 *
 * stComboTimings includes the full loop (A→B→C→D→C→B→A), so we keep only
 * the first occurrence of each station ID to show a clean one-way sequence.
 *
 * @param {string} routeId - Route ID
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {Array} Array of unique station objects in timetable order
 *
 * @example
 * const orderedStations = getRouteStationsInOrder(routeId, api);
 * // Returns: [{ id: '...', name: '...', stNodeId: '...' }, ...]
 */
export function getRouteStationsInOrder(routeId, api) {
    try {
        const routes = api.gameState.getRoutes();
        const route = routes.find(r => r.id === routeId);

        if (!route || !route.stComboTimings || route.stComboTimings.length === 0) {
            return [];
        }

        const allStations = api.gameState.getStations();

        // Build a map of stNodeId -> station for quick lookup
        const stNodeToStation = new Map();
        allStations.forEach(station => {
            if (station.stNodeIds && station.stNodeIds.length > 0) {
                station.stNodeIds.forEach(stNodeId => {
                    stNodeToStation.set(stNodeId, station);
                });
            }
        });

        // Map stComboTimings to stations, then deduplicate by station.id,
        // keeping only the first occurrence (outbound leg of the loop).
        const seen = new Set();
        const orderedStations = [];

        for (const timing of route.stComboTimings) {
            const station = stNodeToStation.get(timing.stNodeId);
            if (!station) continue;
            if (seen.has(station.id)) continue; // skip return-leg duplicates

            seen.add(station.id);
            orderedStations.push({
                id:            station.id,
                name:          station.name || 'Unnamed Station',
                stNodeId:      timing.stNodeId,
                stNodeIndex:   timing.stNodeIndex,
                arrivalTime:   timing.arrivalTime,
                departureTime: timing.departureTime,
            });
        }

        return orderedStations;
    } catch (error) {
        console.error('[RouteUtils] Error getting stations in order:', error);
        return [];
    }
}

/**
 * Get station IDs for a route in timetable order
 *
 * @param {string} routeId - Route ID
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {Array<string>} Array of station IDs in timetable order
 */
export function getRouteStationIds(routeId, api) {
    return getRouteStationsInOrder(routeId, api).map(station => station.id);
}

/**
 * Determine if a route is circular (one-way loop) vs pendulum (back-and-forth).
 *
 * A circular route (A→B→C→A) has its terminus station at both ends of
 * stComboTimings with NO intermediate station repeated.
 * A pendulum route (A→B→C→B→A) has intermediate stations visited twice.
 *
 * @param {Object} route - Route object with stComboTimings
 * @param {Array} allStations - Array of all station objects
 * @returns {boolean} True if circular (loop), false if pendulum or indeterminate
 */
export function isCircularRoute(route, allStations) {
    const stNodeToStationId = new Map();
    allStations.forEach(s => s.stNodeIds?.forEach(n => stNodeToStationId.set(n, s.id)));

    const timings = route.stComboTimings || [];
    if (timings.length < 4) return false; // need at least A, B, C, A

    const ids = timings.map(t => stNodeToStationId.get(t.stNodeId)).filter(Boolean);
    if (ids.length < 4) return false;
    if (ids[0] !== ids[ids.length - 1]) return false; // terminus must close the loop

    const mid = ids.slice(1, -1);
    const seen = new Set();
    for (const id of mid) {
        if (seen.has(id)) return false; // intermediate repeat → pendulum
        seen.add(id);
    }
    return seen.size >= 2; // need at least 2 intermediate unique stations
}

/**
 * Compute the max-segment load fraction for a route from commute data.
 *
 * Returns a scale-invariant value (0–1): the fraction of per-direction
 * ridership that travels through the busiest segment. Multiply by the
 * route's throughput utilisation to get the average load factor at the
 * peak segment.
 *
 * Why a fraction rather than raw counts:
 *   getCompletedCommutes() accumulates over the entire game lifetime, so
 *   raw counts grow with each day played. A fraction normalises this away.
 *
 * Why directions are separated:
 *   For pendulum routes (A→B→C→B→A) the deduplicated station list is
 *   [A, B, C]. WH commuters travelling C→A appear to board at a high
 *   index and alight at a low index. Mixing both directions in a single
 *   cumulative array causes HW boarders at A to be cancelled by WH
 *   alighters at A, producing bogus (often near-zero or extremely large)
 *   results. Processing each direction independently avoids this.
 *
 * @param {string} routeId - Route ID
 * @param {Array<string>} orderedStationIds - Station IDs in timetable order (deduplicated)
 * @param {Array} commutes - Array from getCompletedCommutes()
 * @param {boolean} isCircular - True if circular/loop route
 * @returns {number} Fraction in [0, 1]; multiply by utilization% to get load factor%
 */
export function computeMaxSegmentLoadFraction(routeId, orderedStationIds, commutes, isCircular) {
    if (!orderedStationIds.length || !commutes.length) return 0;

    const n = orderedStationIds.length;
    const stationIdxMap = new Map(orderedStationIds.map((id, i) => [id, i]));

    if (isCircular) {
        // For circular routes, directly accumulate segment loads.
        // There are n segments (0→1, 1→2, …, (n-2)→(n-1), (n-1)→0).
        //
        // We cannot use the boarding/alighting cumulative scan here because
        // getRouteStationsInOrder() deduplicates the terminus, so the station
        // list is [A, B, C, D] (not [A, B, C, D, A]). A passenger travelling
        // D→A therefore gets bi=3, ai=0 — which the bi>ai check misclassifies
        // as "reverse", silently dropping all passengers whose journey ends at
        // the terminus. Direct accumulation handles the wrap-around correctly.
        const segLoad      = new Array(n).fill(0);
        let totalBoarding  = 0;

        for (const c of commutes) {
            if (!c.stationRoutes) continue;
            const size = c.size || 1;
            const seg  = c.stationRoutes.find(s => s.routeId === routeId);
            if (!seg?.stationIds?.length) continue;

            const bi = stationIdxMap.get(seg.stationIds[0]);
            const ai = stationIdxMap.get(seg.stationIds[seg.stationIds.length - 1]);
            if (bi === undefined || ai === undefined || bi === ai) continue;

            totalBoarding += size;

            if (bi < ai) {
                // Normal forward: segments bi → bi+1 → … → ai
                for (let i = bi; i < ai; i++) segLoad[i] += size;
            } else {
                // Wrap-around: bi → … → n-1 (→ terminus) → 0 → … → ai
                for (let i = bi; i < n; i++) segLoad[i] += size;
                for (let i = 0; i < ai; i++) segLoad[i] += size;
            }
        }

        const maxLoad = segLoad.length > 0 ? Math.max(...segLoad) : 0;
        return totalBoarding > 0 ? maxLoad / totalBoarding : 0;
    }

    // ── Pendulum route ────────────────────────────────────────────────────────
    // Separate forward (bi <= ai) and reverse (bi > ai) passengers.
    const fwdBoarding  = new Array(n).fill(0);
    const fwdAlighting = new Array(n).fill(0);
    const revBoarding  = new Array(n).fill(0);
    const revAlighting = new Array(n).fill(0);

    for (const c of commutes) {
        if (!c.stationRoutes) continue;
        const size = c.size || 1;
        const seg  = c.stationRoutes.find(s => s.routeId === routeId);
        if (!seg?.stationIds?.length) continue;

        const bi = stationIdxMap.get(seg.stationIds[0]);
        const ai = stationIdxMap.get(seg.stationIds[seg.stationIds.length - 1]);
        if (bi === undefined || ai === undefined) continue;

        if (bi <= ai) {
            fwdBoarding[bi]  += size;
            fwdAlighting[ai] += size;
        } else {
            revBoarding[bi]  += size;
            revAlighting[ai] += size;
        }
    }

    // Forward cumulative load (low → high index)
    let fwdLoad = 0, fwdMaxLoad = 0;
    for (let i = 0; i < n - 1; i++) {
        fwdLoad += fwdBoarding[i] - fwdAlighting[i];
        if (fwdLoad > fwdMaxLoad) fwdMaxLoad = fwdLoad;
    }
    const fwdTotal = fwdBoarding.reduce((s, b) => s + b, 0);

    // Reverse cumulative load (high → low index) for pendulum return leg
    let revLoad = 0, revMaxLoad = 0;
    for (let i = n - 1; i > 0; i--) {
        revLoad += revBoarding[i] - revAlighting[i];
        if (revLoad > revMaxLoad) revMaxLoad = revLoad;
    }
    const revTotal = revBoarding.reduce((s, b) => s + b, 0);

    // `_computeStaticCapacity` uses loopTimeSec = timings[last] - timings[0], which
    // for a pendulum spans the full round trip (A→…→Z→…→A). It then computes
    // loopsPerHour × capacityPerTrain — one seat-slot per round trip. A train
    // physically carries passengers in both directions per round trip, but the
    // formula credits only one direction's worth of seats. Therefore the capacity
    // it returns is already a per-direction figure for pendulum routes.
    //
    // With per-direction capacity in the denominator, the load factor becomes:
    //
    //   loadFactor = fraction × (ridership / capacity)
    //              = (dominantMaxLoad / totalBoardings) × (ridership / capacity)
    //              ≈ dominantMaxLoad / capacity
    //
    // No ×2 adjustment is needed. For symmetric routes (fwdMaxLoad ≈ revMaxLoad)
    // this equals fwdMaxLoad / fwdTotal, the natural per-direction peak fraction.
    // For asymmetric routes, dominantMaxLoad / totalBoardings < 1 but correctly
    // reflects that the peak direction is more loaded than the average implies.
    const dominantMaxLoad = fwdMaxLoad > revMaxLoad ? fwdMaxLoad : revMaxLoad;
    const totalBoardings  = fwdTotal + revTotal;
    return totalBoardings > 0 ? dominantMaxLoad / totalBoardings : 0;
}
