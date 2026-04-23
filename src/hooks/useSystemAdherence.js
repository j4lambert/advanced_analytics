// useSystemAdherence — live per-stop delay snapshot for the timetable heatmap.
// Polls every REFRESH_INTERVAL and returns full per-route, per-stop data
// plus hub averages and a system-wide on-time percentage.

import { getTimetableAccum }          from '../metrics/accumulator.js';
import { getRouteStationsInOrder }    from '../utils/route-utils.js';
import { getGroupForStation }         from '../utils/station-groups.js';
import { computeAdherenceSnapshot }   from '../metrics/historical-data.js';
import { CONFIG }                     from '../config.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function useSystemAdherence() {
    const [snapshot, setSnapshot] = React.useState(null);

    React.useEffect(() => {
        function compute() {
            try {
                const routes = api.gameState.getRoutes();
                if (!routes.length) { setSnapshot(null); return; }

                // Score is delegated to computeAdherenceSnapshot — single source of truth.
                const { systemAdherenceScore } = computeAdherenceSnapshot(api);

                const { ON_TIME_SEC } = CONFIG.ADHERENCE_THRESHOLDS;
                const hubMap = {}; // groupId → { name, sumDelay, count }

                const routeData = routes.map(route => {
                    const accum    = getTimetableAccum(route.id);
                    const stations = getRouteStationsInOrder(route.id, api);
                    let routeSum = 0, routeCount = 0;

                    const stops = stations.map(station => {
                        const raw        = accum?.[station.stNodeId];
                        const fwd        = raw?.fwd, rev = raw?.rev;
                        const fwdCount   = fwd?.count ?? 0;
                        const revCount   = rev?.count ?? 0;
                        const totalCount = fwdCount + revCount;
                        const hasData    = totalCount > 0;
                        const delaySec   = hasData
                            ? +(((fwd?.sumDelaySec ?? 0) + (rev?.sumDelaySec ?? 0)) / totalCount).toFixed(1)
                            : null;
                        const fwdDelaySec = fwdCount > 0 ? +(fwd.sumDelaySec / fwdCount).toFixed(1) : null;
                        const revDelaySec = revCount > 0 ? +(rev.sumDelaySec / revCount).toFixed(1) : null;

                        const group = getGroupForStation(station.id);
                        const isHub = Boolean(group && group.stationIds.length > 1);

                        if (hasData) {
                            routeSum += delaySec;
                            routeCount++;
                            if (isHub) {
                                if (!hubMap[group.id]) {
                                    hubMap[group.id] = { name: group.name, sumDelay: 0, count: 0, stationIds: group.stationIds };
                                }
                                hubMap[group.id].sumDelay += delaySec;
                                hubMap[group.id].count++;
                            }
                        }

                        return {
                            stationId:    station.id,
                            stationName:  station.name,
                            stNodeId:     station.stNodeId,
                            delaySec,
                            fwdDelaySec,
                            revDelaySec,
                            isHub,
                        };
                    });

                    return {
                        routeId:    route.id,
                        routeName:  route.name || route.bullet,
                        stops,
                        avgDelaySec:   routeCount > 0 ? +(routeSum / routeCount).toFixed(1) : null,
                        totalDelaySec: routeCount > 0 ? +routeSum.toFixed(1) : null,
                    };
                });

                const hubAverages = {};
                for (const [groupId, hub] of Object.entries(hubMap)) {
                    hubAverages[groupId] = {
                        name:        hub.name,
                        avgDelaySec: +(hub.sumDelay / hub.count).toFixed(1),
                        stationIds:  hub.stationIds,
                    };
                }

                setSnapshot({
                    routes: routeData,
                    hubAverages,
                    systemAdherenceScore,
                });
            } catch (e) {
                console.error(`${CONFIG.LOG_PREFIX} useSystemAdherence error:`, e);
            }
        }

        compute();
        const id = setInterval(compute, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, []);

    return snapshot;
}
