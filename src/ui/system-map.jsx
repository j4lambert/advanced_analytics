// System Map Component
// Schematic SVG map of the transport network with Bezier curves.
//
// Transfer detection: uses getStationTransferRoutes() from transfer-utils.js
// which handles both the Zustand path (stationGroups) and the nearbyStations fallback.
//
// Transfers in the game use stations with different IDs but physically close to each other.
// For each station of each route, getStationTransferRoutes() returns the
// other routes reachable from there — if non-empty, it's a transfer point.
// The SVG dot is positioned on the station of the route that encounters it first.

import { getRouteStationsInOrder } from '../utils/route-utils.js';
import { getStationTransferRoutes } from '../utils/transfer-utils.js';
import { getStationGroups, isZustandAvailable } from '../core/zustand-store.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const W   = 900;
const H   = 360;
const PAD = 56;

// ─────────────────────────────────────────────────────────────
// TRANSFER MAP
// Structure: groupKey → { canonicalStationId, routeIds[], name }
//
// groupKey = stationGroup.id if Zustand is available,
//            otherwise the first stationId of the cluster
// ─────────────────────────────────────────────────────────────

/**
 * Builds the transfer map for rendering.
 *
 * For each route and each of its stations, calls getStationTransferRoutes().
 * If it returns connected routes → that station is a transfer point.
 *
 * Groups physically co-located stations (same stationGroup)
 * into a single SVG dot to avoid overlapping duplicates.
 *
 * @returns {Object} groupKey → { canonicalStationId, routeIds[], name }
 */
function buildTransferMap(routes, stationsByRoute, api) {
    const allStations = api.gameState.getStations();

    // Build stationId → groupId using Zustand if available
    const stationToGroup = {};
    if (isZustandAvailable()) {
        getStationGroups().forEach(group => {
            group.stationIds.forEach(sid => {
                stationToGroup[sid] = group.id;
            });
        });
    }
    // Fallback: each station is its own group
    allStations.forEach(s => {
        if (!stationToGroup[s.id]) stationToGroup[s.id] = s.id;
    });

    // For each station in each route, check if it's a transfer point.
    // Accumulate: groupId → Set<routeId>
    const groupToRoutes  = {};
    const groupCanonical = {}; // groupId → stationId (first encountered)

    routes.forEach(route => {
        (stationsByRoute[route.id] || []).forEach(stId => {
            const connectedRoutes = getStationTransferRoutes(stId, route.id, api);
            if (!connectedRoutes.length) return;

            const groupId = stationToGroup[stId] || stId;

            if (!groupToRoutes[groupId]) {
                groupToRoutes[groupId]  = new Set();
                groupCanonical[groupId] = stId;
            }

            // Add the current route + all connected ones
            groupToRoutes[groupId].add(route.id);
            connectedRoutes.forEach(tr => groupToRoutes[groupId].add(tr.routeId));
        });
    });

    // Build final map
    const transferMap = {};
    Object.entries(groupToRoutes).forEach(([groupId, routeIdSet]) => {
        if (routeIdSet.size < 2) return;
        const canonicalId = groupCanonical[groupId];
        const station = allStations.find(s => s.id === canonicalId);
        transferMap[groupId] = {
            canonicalStationId: canonicalId,
            routeIds: Array.from(routeIdSet),
            name: station?.name || 'Transfer',
        };
    });

    return transferMap;
}

// ─────────────────────────────────────────────────────────────
// LAYOUT ENGINE
// ─────────────────────────────────────────────────────────────

function assignBaseY(routes) {
    const n = routes.length;
    const baseYMap = {};
    routes.forEach((route, i) => {
        baseYMap[route.id] = n === 1 ? 50 : 5 + (i / (n - 1)) * 90;
    });
    return baseYMap;
}

/**
 * For each station, returns the canonicalStationId of its transfer group
 * (if it exists). Used by computeLayout to make lines converge.
 */
function buildStationToCanonical(transferMap) {
    const stationToCanonical = {};

    if (isZustandAvailable()) {
        const groups = getStationGroups();
        Object.entries(transferMap).forEach(([groupId, data]) => {
            const group = groups.find(g => g.id === groupId);
            if (group) {
                group.stationIds.forEach(sid => {
                    stationToCanonical[sid] = data.canonicalStationId;
                });
            } else {
                stationToCanonical[groupId] = data.canonicalStationId;
            }
        });
    } else {
        Object.values(transferMap).forEach(data => {
            stationToCanonical[data.canonicalStationId] = data.canonicalStationId;
        });
    }

    return stationToCanonical;
}

function computeLayout(routes, transferMap, stationsByRoute, baseYMap) {
    const stationToCanonical = buildStationToCanonical(transferMap);

    // canonicalStationId → average Y across all routes converging there
    const canonicalY = {};
    Object.values(transferMap).forEach(({ canonicalStationId, routeIds }) => {
        const ys = routeIds.map(rid => baseYMap[rid] ?? 50);
        canonicalY[canonicalStationId] = ys.reduce((a, b) => a + b, 0) / ys.length;
    });

    // Initial points
    const routePoints = {};
    routes.forEach(route => {
        const stations = stationsByRoute[route.id] || [];
        const n = stations.length;
        routePoints[route.id] = stations.map((stId, i) => {
            const canonical = stationToCanonical[stId];
            return {
                stationId:   stId,
                canonicalId: canonical || stId,
                isTransfer:  !!canonical,
                y: canonical ? (canonicalY[canonical] ?? baseYMap[route.id]) : baseYMap[route.id],
                x: n <= 1 ? 0.5 : i / (n - 1),
            };
        });
    });

    // X convergence (3 iterations)
    for (let iter = 0; iter < 3; iter++) {
        const xSum   = {};
        const xCount = {};

        routes.forEach(route => {
            (routePoints[route.id] || []).forEach(pt => {
                if (!pt.isTransfer) return;
                xSum[pt.canonicalId]   = (xSum[pt.canonicalId]   || 0) + pt.x;
                xCount[pt.canonicalId] = (xCount[pt.canonicalId] || 0) + 1;
            });
        });

        routes.forEach(route => {
            (routePoints[route.id] || []).forEach(pt => {
                if (!pt.isTransfer) return;
                if (xCount[pt.canonicalId]) pt.x = xSum[pt.canonicalId] / xCount[pt.canonicalId];
            });
        });

        // Re-smooth non-transfer points
        routes.forEach(route => {
            const pts = routePoints[route.id];
            if (!pts || pts.length < 3) return;
            for (let i = 1; i < pts.length - 1; i++) {
                if (!pts[i].isTransfer) {
                    pts[i].x = (pts[i - 1].x + pts[i + 1].x) / 2;
                }
            }
        });
    }

    return routePoints;
}

function toSVG(x, y) {
    return {
        px: PAD + x * (W - 2 * PAD),
        py: PAD + (y / 100) * (H - 2 * PAD),
    };
}

function buildPath(svgPts) {
    if (svgPts.length < 2) return '';
    let d = `M ${svgPts[0].px},${svgPts[0].py}`;
    for (let i = 0; i < svgPts.length - 1; i++) {
        const a  = svgPts[i];
        const b  = svgPts[i + 1];
        const cx = (a.px + b.px) / 2;
        d += ` C ${cx},${a.py} ${cx},${b.py} ${b.px},${b.py}`;
    }
    return d;
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

function useSystemMapData() {
    const [mapData, setMapData] = React.useState(null);

    React.useEffect(() => {
        function update() {
            try {
                const routes   = api.gameState.getRoutes();
                const stations = api.gameState.getStations();

                if (!routes.length) { setMapData(null); return; }

                // routeId → stationId[] in timetable order
                const stationsByRoute = {};
                routes.forEach(route => {
                    const ordered = getRouteStationsInOrder(route.id, api);
                    stationsByRoute[route.id] = ordered.map(s => s.id);
                });

                // stationId → name
                const stationNames = {};
                stations.forEach(s => { stationNames[s.id] = s.name || 'Station'; });

                // Transfer map
                const transferMap = buildTransferMap(routes, stationsByRoute, api);

                // BaseY
                const baseYMap = assignBaseY(routes);

                // Layout
                const routePoints = computeLayout(routes, transferMap, stationsByRoute, baseYMap);

                // Route rendering
                const renderedRoutes = routes.map(route => {
                    const pts    = routePoints[route.id] || [];
                    const svgPts = pts.map(({ x, y }) => toSVG(x, y));
                    return {
                        id:     route.id,
                        bullet: route.bullet || route.name || route.id,
                        name:   route.name   || route.bullet || route.id,
                        color:  route.color  || '#888888',
                        svgPts, pts,
                        path:   buildPath(svgPts),
                    };
                });

                // Transfer dots: SVG position from the first route containing canonicalId
                const transferDots = Object.entries(transferMap).map(([groupId, data]) => {
                    const { canonicalStationId, routeIds, name } = data;

                    let px = null, py = null;
                    for (const route of routes) {
                        const pt = (routePoints[route.id] || []).find(
                            p => p.canonicalId === canonicalStationId
                        );
                        if (pt) {
                            const svg = toSVG(pt.x, pt.y);
                            px = svg.px;
                            py = svg.py;
                            break;
                        }
                    }

                    if (px === null) return null;
                    return { groupId, canonicalStationId, name, px, py, routeIds };
                }).filter(Boolean);

                setMapData({ renderedRoutes, transferDots, transferMap, stationNames, routes });

            } catch (err) {
                console.error('[SystemMap] Error computing layout:', err);
                setMapData(null);
            }
        }

        update();
        const interval = setInterval(update, 5000);
        return () => clearInterval(interval);
    }, []);

    return mapData;
}

// ─────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────

function MapTooltip({ data, mapData }) {
    if (!data || !mapData) return null;

    const { groupId, x, y } = data;
    const { transferMap, routes } = mapData;
    const entry = transferMap[groupId];
    if (!entry) return null;

    return (
        <div
            className='bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg'
            style={{
                position: 'fixed', left: x, top: y,
                transform: 'translateY(-125%)',
            }}
        >
            <div className="font-semibold text-xs mb-1">{entry.name}</div>
            <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-border">
                {entry.routeIds.map(rid => {
                    const route = routes.find(r => r.id === rid);
                    return (
                        <div key={rid} className="flex items-center gap-1.5">
                            <div style={{
                                width: 18, height: 3, borderRadius: 2,
                                background: route?.color || '#888',
                            }} />
                            <span className="text-[10px] text-muted-foreground">
                                {route?.name || route?.bullet || rid}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function SystemMap() {
    const [hoveredRoute, setHoveredRoute] = React.useState(null);
    const [tooltip, setTooltip]           = React.useState(null);

    const mapData = useSystemMapData();

    if (!mapData || !mapData.renderedRoutes.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-muted-foreground mb-2 text-sm">
                    {!mapData ? 'Generating system map…' : 'No routes found'}
                </div>
                <div className="text-xs text-muted-foreground">
                    Build routes and stations to see the network map
                </div>
            </div>
        );
    }

    const { renderedRoutes, transferDots, routes } = mapData;

    return (
        <div className="space-y-3">
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                {renderedRoutes.map(route => (
                    <div
                        key={route.id}
                        className="flex items-center gap-1.5 cursor-pointer transition-opacity"
                        style={{ opacity: hoveredRoute && hoveredRoute !== route.id ? 0.3 : 1 }}
                        onMouseEnter={() => setHoveredRoute(route.id)}
                        onMouseLeave={() => setHoveredRoute(null)}
                    >
                        <div style={{ width: 20, height: 3, borderRadius: 2, background: route.color }} />
                        <span className="text-[10px] text-muted-foreground">{route.name}</span>
                    </div>
                ))}
                {transferDots.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <circle cx="6" cy="6" r="5" fill="#a78bfa"
                                    stroke="#a78bfa" strokeWidth="1" />
                            <circle cx="6" cy="6" r="4" fill="var(--background)" />
                        </svg>
                        <span className="text-[10px] text-muted-foreground">Transfer</span>
                    </div>
                )}
            </div>

            {/* SVG map */}
            <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    style={{ width: '100%', overflow: 'visible', display: 'block' }}
                >
                    {/* Grid */}
                    {Array.from({ length: 11 }).map((_, i) => {
                        const x = PAD + (i / 10) * (W - 2 * PAD);
                        return (
                            <line key={i}
                                  x1={x} y1={PAD / 2} x2={x} y2={H - PAD / 2}
                                  stroke="currentColor" strokeOpacity={0.04} strokeWidth={1}
                            />
                        );
                    })}

                    {/* Route paths */}
                    {renderedRoutes.map(route => (
                        <path
                            key={route.id}
                            d={route.path}
                            fill="none"
                            stroke={route.color}
                            strokeWidth={hoveredRoute === route.id ? 4 : hoveredRoute ? 1.5 : 2.5}
                            strokeOpacity={hoveredRoute && hoveredRoute !== route.id ? 0.1 : 1}
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{
                                filter: hoveredRoute === route.id
                                    ? `drop-shadow(0 0 5px ${route.color}80)` : 'none',
                                transition: 'stroke-width 0.15s, stroke-opacity 0.15s',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={() => setHoveredRoute(route.id)}
                            onMouseLeave={() => setHoveredRoute(null)}
                        />
                    ))}

                    {/* Transfer dots */}
                    {transferDots.map(({ groupId, name, px, py, routeIds }) => (
                        <g
                            key={groupId}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={e => setTooltip({ groupId, x: e.clientX, y: e.clientY })}
                            onMouseMove={e  => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                            onMouseLeave={() => setTooltip(null)}
                        >
                            <circle cx={px} cy={py} r={16} fill="transparent" />
                            <circle cx={px} cy={py} r={8}
                                    fill="var(--background,#060d1a)"
                                    stroke="#a78bfa"
                                    strokeWidth={1.5}
                            />
                            {routeIds.map((rid, i) => {
                                const route  = routes.find(r => r.id === rid);
                                const total  = routeIds.length;
                                const angle  = (i / total) * Math.PI * 2 - Math.PI / 2;
                                const radius = total > 2 ? 4 : 2.5;
                                const pipR   = total > 2 ? 1.8 : 2.2;
                                return (
                                    <circle key={rid}
                                            cx={px + Math.cos(angle) * radius}
                                            cy={py + Math.sin(angle) * radius}
                                            r={pipR}
                                            fill={route?.color || '#888'}
                                    />
                                );
                            })}
                            <text
                                x={px} y={py - 13}
                                textAnchor="middle" fontSize={8}
                                fill="currentColor" fillOpacity={0.4}
                                style={{ fontFamily: 'monospace', letterSpacing: '0.06em' }}
                            >
                                {name.length > 12 ? name.slice(0, 11) + '…' : name.toUpperCase()}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>

            {/* Transfer chips */}
            {transferDots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {transferDots.map(({ groupId, name, routeIds }) => (
                        <div
                            key={groupId}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/30 text-[10px]"
                        >
                            <span>{name}</span>
                            <span className="text-border">·</span>
                            {routeIds.map(rid => {
                                const route = routes.find(r => r.id === rid);
                                return (
                                    <div key={rid} style={{
                                        width: 7, height: 7, borderRadius: '50%',
                                        background: route?.color || '#888',
                                    }} />
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            <MapTooltip data={tooltip} mapData={mapData} />
        </div>
    );
}
