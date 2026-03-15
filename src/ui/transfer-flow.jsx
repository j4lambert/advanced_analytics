// Transfer Flow Component
// Sankey chart showing the full passenger flow through a selected transfer hub.
//
// LAYOUT (5 columns — mirrors commute-flow topology, aggregated across all routes):
//
//   [Home→Work (bd.)] ─┐                                         ┌─ [Home→Work (al.)]
//                      ├──► [Boarding] ─────► [STATION] ─────► [Alighting] ┤
//   [Work→Home (bd.)] ─┘                                         └─ [Work→Home (al.)]
//
//   [Route A ←] ──────────────────────────────────────────────────────────────► [→ Route A]
//   [Route B ←] ──────────────────────────────────────────────────────────────► [→ Route B]
//
// Boarding / Alighting counts are aggregated across ALL routes serving the hub,
// with HW/WH split exactly as in commute-flow.
//
// Route in/out flows connect directly to the Station node (bypassing the aggregators),
// so each route's "pipe" spans the full width of the chart.
//
// Station balance:
//   in  = totalBoarding (via Boarding aggregator) + Σ viaMetroIn_R (direct)
//   out = totalAlighting (via Alighting aggregator) + Σ viaMetroOut_R (direct)  → always equal
//
// viaMetroIn_R  = passthrough_R + alighting_R
// viaMetroOut_R = passthrough_R + boarding_R
//
// Legend: RouteBadge per route — click opens the Route dialog, hover highlights
// that route's Sankey flows while dimming everything else.
//
// STANDALONE: importable from any context.
// Pass `initialHubId` to pre-select a hub.

import { CONFIG }                               from '../config.js';
import { getRouteStationsInOrder }              from '../utils/route-utils.js';
import { isZustandAvailable, getTransferGroups } from '../core/api-support.js';
import { Dropdown }                             from '../components/dropdown.jsx';
import { DropdownItem }                         from '../components/dropdown-item.jsx';
import { RouteBadge }                           from '../components/route-badge.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// Journey-type palette (matches commute-flow)
const COLOR_HOME_WORK  = '#3b82f6'; // blue-500
const COLOR_WORK_HOME  = '#ef4444'; // red-500
const COLOR_AGGREGATOR = '#64748b'; // slate-500 — Boarding / Alighting aggregator nodes

// ── Transfer Hub list hook ────────────────────────────────────────────────────
// Zustand path  → station groups with 2+ stations.
// Fallback path → stations that directly serve 2+ routes.

function useTransferHubs() {
    const [hubs, setHubs] = React.useState([]);

    React.useEffect(() => {
        const compute = () => {
            if (isZustandAvailable()) {
                const groups = getTransferGroups();
                setHubs(groups.map(g => ({
                    id:         g.id,
                    name:       g.name || g.id,
                    stationIds: g.stationIds,
                })));
            } else {
                const allStations = api.gameState.getStations();
                setHubs(
                    allStations
                        .filter(s => s.routeIds?.length >= 2)
                        .map(s => ({
                            id:         s.id,
                            name:       s.name || s.id,
                            stationIds: [s.id],
                        }))
                );
            }
        };

        compute();
        const id = setInterval(compute, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, []);

    return hubs;
}

// ── Transfer Flow data hook ───────────────────────────────────────────────────
// For every route serving any station in `stationIds`, computes per-route:
//   boardingHW / boardingWH / alightingHW / alightingWH / passthroughTotal
//   viaMetroIn  = passthrough + alighting
//   viaMetroOut = passthrough + boarding
//   prevStationName / nextStationName

function useTransferFlowData(stationIds) {
    const [data, setData] = React.useState(null);
    const depsKey = stationIds ? [...stationIds].sort().join(',') : '';

    React.useEffect(() => {
        if (!stationIds?.length) { setData(null); return; }

        const compute = () => {
            try {
                const allStations = api.gameState.getStations();
                const allRoutes   = api.gameState.getRoutes();
                const commutes    = api.gameState.getCompletedCommutes?.() ?? [];

                // ── Build one entry per unique (routeId, stationId) pair ──────
                const entries = [];
                const seen    = new Set();

                for (const stationId of stationIds) {
                    const station = allStations.find(s => s.id === stationId);
                    if (!station?.routeIds) continue;

                    for (const routeId of station.routeIds) {
                        const key = `${routeId}:${stationId}`;
                        if (seen.has(key)) continue;
                        seen.add(key);

                        const orderedStations = getRouteStationsInOrder(routeId, api);
                        const orderedIds      = orderedStations.map(s => s.id);
                        const selectedIdx     = orderedIds.indexOf(stationId);

                        entries.push({
                            routeId,
                            stationId,
                            orderedStations,
                            orderedIds,
                            selectedIdx,
                            boardingHW:       0,
                            boardingWH:       0,
                            alightingHW:      0,
                            alightingWH:      0,
                            passthroughTotal: 0,
                        });
                    }
                }

                // ── Single pass over all commutes ─────────────────────────────
                for (const c of commutes) {
                    if (!c.stationRoutes) continue;
                    const size = c.size || 1;
                    const isHW = c.origin === 'home';

                    for (const entry of entries) {
                        const seg = c.stationRoutes.find(s => s.routeId === entry.routeId);
                        if (!seg?.stationIds?.length) continue;

                        const segEntry = seg.stationIds[0];
                        const segExit  = seg.stationIds[seg.stationIds.length - 1];
                        const sid      = entry.stationId;

                        if (segEntry === sid) {
                            if (isHW) entry.boardingHW  += size;
                            else      entry.boardingWH  += size;
                        } else if (segExit === sid) {
                            if (isHW) entry.alightingHW += size;
                            else      entry.alightingWH += size;
                        } else if (entry.selectedIdx !== -1) {
                            const ei = entry.orderedIds.indexOf(segEntry);
                            const xi = entry.orderedIds.indexOf(segExit);
                            if (ei !== -1 && xi !== -1) {
                                const lo = Math.min(ei, xi);
                                const hi = Math.max(ei, xi);
                                if (entry.selectedIdx > lo && entry.selectedIdx < hi) {
                                    entry.passthroughTotal += size;
                                }
                            }
                        }
                    }
                }

                // ── Convert entries to display objects ────────────────────────
                const routes = entries.map(entry => {
                    const route               = allRoutes.find(r => r.id === entry.routeId);
                    const { orderedStations, selectedIdx } = entry;

                    const prev = selectedIdx > 0
                        ? orderedStations[selectedIdx - 1]
                        : orderedStations[selectedIdx + 1];
                    const next = selectedIdx < orderedStations.length - 1
                        ? orderedStations[selectedIdx + 1]
                        : orderedStations[selectedIdx - 1];

                    const totalBoarding  = entry.boardingHW  + entry.boardingWH;
                    const totalAlighting = entry.alightingHW + entry.alightingWH;

                    return {
                        routeId:          entry.routeId,
                        stationId:        entry.stationId,
                        color:            route?.color  ?? '#6b7280',
                        bullet:           route?.bullet ?? '?',
                        name:             route?.name   ?? entry.routeId,
                        boardingHW:       entry.boardingHW,
                        boardingWH:       entry.boardingWH,
                        alightingHW:      entry.alightingHW,
                        alightingWH:      entry.alightingWH,
                        totalBoarding,
                        totalAlighting,
                        passthroughTotal: entry.passthroughTotal,
                        viaMetroIn:       entry.passthroughTotal + totalAlighting,
                        viaMetroOut:      entry.passthroughTotal + totalBoarding,
                        prevStationName:  prev?.name ?? '?',
                        nextStationName:  next?.name ?? '?',
                    };
                });

                setData(routes);
            } catch (err) {
                console.error(`${CONFIG.LOG_PREFIX} TransferFlow error:`, err);
                setData([]);
            }
        };

        compute();
        const id = setInterval(compute, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, [depsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    return data;
}

// ── Sankey data builder ───────────────────────────────────────────────────────
// 5-column topology (mirrors commute-flow, aggregated across all routes):
//
//   Col 0 (sources):     HW-boarding, WH-boarding, Route-in nodes
//   Col 1 (center-left): Boarding aggregator
//   Col 2 (center):      Station
//   Col 3 (center-right):Alighting aggregator
//   Col 4 (sinks):       HW-alighting, WH-alighting, Route-out nodes
//
// Route-in  → Station (direct, skips the aggregators) → depth 1 (col 0 → col 2)
// Route-out ← Station (direct, skips the aggregators) → sinks are bumped to col 4
//
// Each link carries:
//   color   — fill colour for the link renderer
//   routeId — null for HW/WH/aggregator flows, route ID for metro flows
//             (used for hover highlighting)

function buildTransferSankeyData(routesData, groupName) {
    const nodes = [{ name: groupName }];                    // node 0 = station
    const meta  = [{ side: 'center', color: null, label: null, routeId: null }];
    const links = [];

    // Aggregate HW/WH boarding & alighting across all routes
    const totBoardHW  = routesData.reduce((s, r) => s + r.boardingHW,   0);
    const totBoardWH  = routesData.reduce((s, r) => s + r.boardingWH,   0);
    const totAlightHW = routesData.reduce((s, r) => s + r.alightingHW,  0);
    const totAlightWH = routesData.reduce((s, r) => s + r.alightingWH,  0);
    const totalBoard  = totBoardHW  + totBoardWH;
    const totalAlight = totAlightHW + totAlightWH;

    // ── Boarding aggregator (col 1, center-left) ──────────────────────────────
    let boardingIdx = null;
    if (totalBoard > 0) {
        boardingIdx = nodes.length;
        nodes.push({ name: 'Boarding' });
        meta.push({ side: 'center-left', color: COLOR_AGGREGATOR, label: 'Boarding', routeId: null });
        links.push({ source: boardingIdx, target: 0, value: totalBoard, color: COLOR_AGGREGATOR, routeId: null });
    }

    // ── Alighting aggregator (col 3, center-right) ───────────────────────────
    let alightingIdx = null;
    if (totalAlight > 0) {
        alightingIdx = nodes.length;
        nodes.push({ name: 'Alighting' });
        meta.push({ side: 'center-right', color: COLOR_AGGREGATOR, label: 'Alighting', routeId: null });
        links.push({ source: 0, target: alightingIdx, value: totalAlight, color: COLOR_AGGREGATOR, routeId: null });
    }

    // ── Left: HW/WH boarding sources → Boarding aggregator ───────────────────
    if (boardingIdx !== null) {
        if (totBoardHW > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Home → Work' });
            meta.push({ side: 'left', color: COLOR_HOME_WORK, label: 'Home →', routeId: null });
            links.push({ source: i, target: boardingIdx, value: totBoardHW, color: COLOR_HOME_WORK, routeId: null });
        }
        if (totBoardWH > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Work → Home' });
            meta.push({ side: 'left', color: COLOR_WORK_HOME, label: 'Work →', routeId: null });
            links.push({ source: i, target: boardingIdx, value: totBoardWH, color: COLOR_WORK_HOME, routeId: null });
        }
    }

    // ── Right: Alighting aggregator → HW/WH alighting sinks ──────────────────
    if (alightingIdx !== null) {
        if (totAlightHW > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Home → Work' });
            meta.push({ side: 'right', color: COLOR_HOME_WORK, label: '→ Work', routeId: null });
            links.push({ source: alightingIdx, target: i, value: totAlightHW, color: COLOR_HOME_WORK, routeId: null });
        }
        if (totAlightWH > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Work → Home' });
            meta.push({ side: 'right', color: COLOR_WORK_HOME, label: '→ Home', routeId: null });
            links.push({ source: alightingIdx, target: i, value: totAlightWH, color: COLOR_WORK_HOME, routeId: null });
        }
    }

    // ── Per-route metro in / out (direct connection to/from Station) ──────────
    for (const r of routesData) {
        if (r.viaMetroIn > 0) {
            const i = nodes.length;
            nodes.push({ name: r.bullet });
            meta.push({ side: 'left', color: r.color, label: `${r.prevStationName} →`, routeId: r.routeId });
            links.push({ source: i, target: 0, value: r.viaMetroIn, color: r.color, routeId: r.routeId });
        }
        if (r.viaMetroOut > 0) {
            const i = nodes.length;
            nodes.push({ name: r.bullet });
            meta.push({ side: 'right', color: r.color, label: `→ ${r.nextStationName}`, routeId: r.routeId });
            links.push({ source: 0, target: i, value: r.viaMetroOut, color: r.color, routeId: r.routeId });
        }
    }

    return { nodes, links, meta };
}

// ── Custom Sankey node renderer ───────────────────────────────────────────────
// Colours:
//   center        → currentColor (station bar)
//   center-left/right → COLOR_AGGREGATOR (boarding/alighting aggregator)
//   left/right    → node's own color (HW/WH or route colour)
//
// Labels:
//   center        → none (hub name is an absolute overlay)
//   center-left/right → above the bar, centred
//   left          → to the left, right-aligned
//   right         → to the right, left-aligned
//
// Hover: when `hoveredRouteId` is set, non-route nodes and nodes of other routes
//        are dimmed to convey "this is not the focused route".

function makeNodeRenderer(meta, hoveredRouteId) {
    return function SankeyNode({ x, y, width, height, index }) {
        const m   = meta[index] ?? { side: 'center', color: null, routeId: null };
        const w   = Math.max(width,  2);
        const h   = Math.max(height, 2);
        const mid = y + h / 2;

        const isCenter     = m.side === 'center';
        const isAggregator = m.side === 'center-left' || m.side === 'center-right';
        const color        = isCenter ? 'currentColor' : (m.color ?? COLOR_AGGREGATOR);

        // Hover-driven opacity:
        // • station always full
        // • when a route is hovered: route-nodes of OTHER routes → dim
        //   aggregator / HW/WH nodes also dim to keep the focus clear
        let opacity = isCenter ? 0.95 : 0.80;
        if (hoveredRouteId) {
            if (isCenter) {
                opacity = 0.95;
            } else if (m.routeId === hoveredRouteId) {
                opacity = 0.90;
            } else {
                opacity = 0.15;
            }
        }

        // Label position
        let textX, textAnchor, textY, baseline;
        if (isCenter) {
            textX = textY = 0; textAnchor = 'middle'; baseline = 'auto'; // unused
        } else if (isAggregator) {
            textX      = x + w / 2;
            textAnchor = 'middle';
            textY      = y - 8;
            baseline   = 'auto';
        } else if (m.side === 'left') {
            textX      = x - 8;
            textAnchor = 'end';
            textY      = mid;
            baseline   = 'middle';
        } else { // right
            textX      = x + w + 8;
            textAnchor = 'start';
            textY      = mid;
            baseline   = 'middle';
        }

        const label = isCenter ? null : (m.label ?? '');

        return React.createElement('g', {}, [
            React.createElement('rect', {
                key: 'r',
                x, y, width: w, height: h,
                fill: color, fillOpacity: opacity, rx: 0,
            }),
            label && React.createElement('text', {
                key:              'label',
                x:                textX,
                y:                textY,
                textAnchor,
                dominantBaseline: baseline,
                fontSize:         11,
                fill:             'var(--aa-chart-secondary-metric)',
            }, label),
        ].filter(Boolean));
    };
}

// ── Custom Sankey link renderer ───────────────────────────────────────────────
// link.color  → stroke colour
// link.routeId → null for HW/WH/aggregator flows; route ID for metro flows
//
// Default opacities:
//   metro (route) links → 0.70
//   HW/WH links        → 0.35
//   aggregator links   → 0.35
//
// Hover: hovered-route links emphasised (0.85); all others dimmed (0.10).

function makeLinkRenderer(links, hoveredRouteId) {
    return function SankeyLink({
        sourceX, targetX,
        sourceY, targetY,
        sourceControlX, targetControlX,
        linkWidth, index,
    }) {
        const link = links[index];
        if (!link) return null;

        const isRouteFlow      = link.routeId != null;
        const isAggregatorFlow = link.color === COLOR_AGGREGATOR;
        const defaultOpacity   = isRouteFlow ? 0.70 : 0.35;

        let opacity = defaultOpacity;
        if (hoveredRouteId) {
            opacity = (isRouteFlow && link.routeId === hoveredRouteId) ? 0.85 : 0.10;
        }

        const d = [
            `M ${sourceX},${sourceY}`,
            `C ${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`,
        ].join(' ');

        return React.createElement('path', {
            d,
            strokeWidth:   Math.max(linkWidth, 1),
            stroke:        link.color,
            fill:          'none',
            strokeOpacity: opacity,
        });
    };
}

// ── Sankey chart ──────────────────────────────────────────────────────────────

function TransferSankey({ routesData, groupName, hoveredRouteId }) {
    const totalFlow = routesData.reduce((s, r) => s + r.viaMetroIn + r.totalBoarding, 0);

    if (totalFlow === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                {React.createElement(icons.Users, { size: 40, className: 'text-muted-foreground mb-3' })}
                <p className="text-sm text-muted-foreground">
                    No completed commute data for this transfer hub yet
                </p>
            </div>
        );
    }

    const { nodes, links, meta } = buildTransferSankeyData(routesData, groupName);

    // Include hoveredRouteId in memo key so renderers rebuild on hover change
    const NodeRenderer = React.useMemo(
        () => makeNodeRenderer(meta, hoveredRouteId),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(meta), hoveredRouteId],
    );
    const LinkRenderer = React.useMemo(
        () => makeLinkRenderer(links, hoveredRouteId),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(links), hoveredRouteId],
    );

    return (
        <div style={{ width: '100%', height: 280, position: 'relative' }}>
            {/* Hub name centred above the station bar */}
            <div
                className="absolute left-0 right-0 top-3 text-center pointer-events-none"
                style={{ zIndex: 1 }}
            >
                <span className="font-bold text-sm text-foreground">{groupName}</span>
            </div>

            <charts.ResponsiveContainer width="100%" height="100%">
                <charts.Sankey
                    data={{ nodes, links }}
                    nodeWidth={14}
                    nodePadding={20}
                    iterations={0}
                    margin={{ top: 60, right: 200, bottom: 30, left: 200 }}
                    node={NodeRenderer}
                    link={LinkRenderer}
                >
                    <charts.Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p   = payload[0];
                            const val = p.value ?? p.payload?.value ?? 0;
                            return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg text-xs">
                                    <div className="font-medium mb-1">{p.payload?.name || p.name || ''}</div>
                                    <div className="text-muted-foreground">{val.toLocaleString()} pops</div>
                                </div>
                            );
                        }}
                    />
                </charts.Sankey>
            </charts.ResponsiveContainer>
        </div>
    );
}

// ── Legend ────────────────────────────────────────────────────────────────────
// Left half: static colour swatches for HW/WH and aggregator flows.
// Right half: one RouteBadge per route.
//   • Clicking a badge opens the Route dialog (handled by RouteBadge internally).
//   • Hovering a badge highlights that route's flows in the Sankey.

function TransferFlowLegend({ routesData, hoveredRouteId, onHover, onLeave }) {
    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
            {/* Journey-type swatches */}
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_HOME_WORK }} />
                <span>Home → Work</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_WORK_HOME }} />
                <span>Work → Home</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_AGGREGATOR }} />
                <span>Boarding / Alighting</span>
            </div>

            {/* Separator */}
            {routesData.length > 0 && (
                <span className="border-l border-border h-4" />
            )}

            {/* Per-route RouteBadges — click navigates, hover highlights */}
            {routesData.map(r => (
                <div
                    key={r.routeId}
                    className="transition-opacity"
                    style={{
                        opacity:  hoveredRouteId && hoveredRouteId !== r.routeId ? 0.35 : 1,
                        cursor:   'pointer',
                    }}
                    onMouseEnter={() => onHover?.(r.routeId)}
                    onMouseLeave={() => onLeave?.()}
                    // Click is delegated to RouteBadge (interactive=true)
                >
                    <RouteBadge routeId={r.routeId} size="1.4rem" interactive={true} />
                </div>
            ))}
        </div>
    );
}

// ── Main exported component ───────────────────────────────────────────────────
// Props:
//   initialHubId (optional) — pre-select a specific hub by its group / station ID

export function TransferFlow({ initialHubId }) {
    const hubs = useTransferHubs();
    const [selectedHubId,  setSelectedHubId]  = React.useState(initialHubId ?? null);
    const [hoveredRouteId, setHoveredRouteId] = React.useState(null);

    // Auto-select the first hub when the list loads
    React.useEffect(() => {
        if (!selectedHubId && hubs.length > 0) {
            setSelectedHubId(hubs[0].id);
        }
    }, [hubs]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear hover when switching hubs
    React.useEffect(() => {
        setHoveredRouteId(null);
    }, [selectedHubId]);

    const selectedHub = hubs.find(h => h.id === selectedHubId) ?? null;
    const routesData  = useTransferFlowData(selectedHub?.stationIds);

    // ── Empty state: no transfer hubs in the network yet ─────────────────────
    if (hubs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border bg-background/50">
                {React.createElement(icons.Component, { size: 36, className: 'text-muted-foreground mb-3' })}
                <p className="text-sm text-muted-foreground">No transfer hubs detected yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                    Transfer hubs appear when two or more routes share a station location
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Hub selector ── */}
            <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1.5">
                    {React.createElement(icons.Component, { size: 13, className: 'text-purple-500' })}
                    Transfer Hub
                </span>
                <Dropdown
                    value={selectedHubId}
                    onChange={setSelectedHubId}
                    togglerContent={
                        <span className="font-medium">{selectedHub?.name ?? '…'}</span>
                    }
                    togglerClasses="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                >
                    {hubs.map(h => (
                        <DropdownItem key={h.id} value={h.id} text={h.name} />
                    ))}
                </Dropdown>
            </div>

            {/* ── Chart + legend ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {!routesData ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Loading…
                    </div>
                ) : (
                    <>
                        <TransferSankey
                            routesData={routesData}
                            groupName={selectedHub?.name ?? ''}
                            hoveredRouteId={hoveredRouteId}
                        />
                        <div className="mt-4 pt-4 border-t border-border/50">
                            <TransferFlowLegend
                                routesData={routesData}
                                hoveredRouteId={hoveredRouteId}
                                onHover={setHoveredRouteId}
                                onLeave={() => setHoveredRouteId(null)}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
