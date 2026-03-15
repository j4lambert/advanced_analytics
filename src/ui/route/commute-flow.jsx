// Commute Flow Component
// Sankey chart showing the full passenger flow through a selected station on a route.
//
// The Sankey and its underlying data logic are shared with TransferFlow (see
// src/ui/transfer-flow.jsx).  For each selected station the component resolves
// the "hub" — all station IDs in the same physical interchange group — and feeds
// them to useTransferFlowData so that ALL connecting routes are displayed, not just
// the one currently being viewed.
//
// KEY DIFFERENCES FROM THE STANDALONE TransferFlow DASHBOARD SECTION:
//   • Station selection is driven by the StationStrip, not a dropdown.
//   • The current route's RouteBadge in the legend is non-interactive.
//   • The chart title is the selected station's name (not the group/hub name).
//
// Hub resolution:
//   Zustand available → getGroupForStation(selectedId).stationIds (canonical)
//   Fallback          → [selectedId] + any nearby transfer station IDs
//                       (covers the nearbyStations walkingTime heuristic)

import { CONFIG }                                      from '../../config.js';
import { getRouteStationsInOrder }                     from '../../utils/route-utils.js';
import { getStationTransferRoutes }                    from '../../utils/transfer-utils.js';
import { isZustandAvailable, getGroupForStation }      from '../../core/api-support.js';
import { useTransferFlowData, TransferSankey, TransferFlowLegend } from '../transfer-flow.jsx';
import { Dropdown }                                    from '../../components/dropdown.jsx';
import { DropdownItem }                                from '../../components/dropdown-item.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Station Strip ─────────────────────────────────────────────────────────────
// Horizontal scrollable row of station dots connected by a route-coloured line.
// Clicking a dot selects that station; transfer stations show a badge count.

function StationStrip({ stations, selectedId, routeColor, onSelect, routeId }) {
    const scrollRef = React.useRef(null);

    // Horizontally centre the selected station without scrolling the dialog vertically.
    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const el = container.querySelector(`[data-sid="${selectedId}"]`);
        if (!el) return;
        const target = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
        container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [selectedId]);

    return (
        <div
            ref={scrollRef}
            className="overflow-x-auto"
            style={{ scrollbarWidth: 'thin', paddingBottom: 4 }}
        >
            <div className="flex justify-between" style={{ minWidth: '100%' }}>
                {stations.map((st, idx) => {
                    const selected       = st.id === selectedId;
                    const transferRoutes = getStationTransferRoutes(st.id, routeId, api);
                    return (
                        <React.Fragment key={st.id}>
                            {/* Connector line */}
                            {idx > 0 && (
                                <div style={{
                                    minWidth:   36,
                                    height:     10,
                                    marginTop:  2,
                                    background: routeColor,
                                    flexShrink: 0,
                                    flexGrow:   1,
                                }} />
                            )}

                            {/* Station dot + label + optional transfer indicator */}
                            <div
                                data-sid={st.id}
                                className="flex flex-col items-center"
                                style={{flexShrink: 0}}
                            >
                                <button
                                    onClick={() => onSelect(st.id)}
                                    className="flex relative flex-col items-center w-full gap-1.5 focus:outline-none text-muted-foreground hover:text-foreground"
                                    title={st.name}
                                >
                                    <div style={{
                                        position:   'absolute',
                                        left:       0,
                                        right:      0,
                                        height:     10,
                                        top:        2,
                                        background: routeColor,
                                        borderRadius: idx === 0 ? '5px 0 0 5px' : idx === (stations.length -1) ? '0 5px 5px 0' :  0,
                                    }} />
                                    <div style={{
                                        width:        10,
                                        height:       10,
                                        borderRadius: '50%',
                                        outline:      `2px solid ${selected ? 'white' : 'black'}`,
                                        background:   selected ? 'black' : 'white',
                                        transition:   'all 0.15s ease',
                                        cursor:       'pointer',
                                        marginTop:    2,
                                        zIndex:       1,
                                    }} />
                                    <span style={{
                                        fontSize:     12,
                                        maxWidth:     160,
                                        overflow:     'hidden',
                                        textOverflow: 'ellipsis',
                                        fontWeight:   selected ? 'bold' : 'normal',
                                        whiteSpace:   'nowrap',
                                        display:      'block',
                                        color: selected
                                            ? 'var(--aa-chart-secondary-metric)'
                                            : 'hsl(var(--muted-foreground))',
                                    }}>
                                        {st.name}
                                    </span>
                                </button>

                                {/* Transfer indicator */}
                                {transferRoutes.length > 0 && (() => {
                                    const liveRoutes = api.gameState.getRoutes();
                                    return (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <span style={{ color: '#a855f7' }}>
                                                {React.createElement(icons.Component, { size: 10 })}
                                            </span>
                                            <Dropdown
                                                togglerContent={
                                                    <span className="text-xs font-semibold tabular-nums">
                                                        {transferRoutes.length}
                                                    </span>
                                                }
                                                togglerClasses="flex items-center gap-0.5 rounded hover:bg-accent px-0.5 transition-colors"
                                                onChange={rid => window.AdvancedAnalytics?.openRouteDialog?.(rid)}
                                            >
                                                {transferRoutes.map(tr => {
                                                    const route = liveRoutes.find(r => r.id === tr.routeId);
                                                    return route
                                                        ? <DropdownItem key={tr.routeId} value={tr.routeId} route={route} />
                                                        : null;
                                                })}
                                            </Dropdown>
                                        </div>
                                    );
                                })()}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

// ── Exported component ────────────────────────────────────────────────────────

export function CommuteFlow({ routeId, externalStationId }) {
    const routes = api.gameState.getRoutes();

    const { routeColor } = React.useMemo(() => {
        const r = routes.find(r => r.id === routeId);
        return { routeColor: r?.color ?? '#6b7280' };
    }, [routeId, routes]);

    const stations = React.useMemo(
        () => (routeId ? getRouteStationsInOrder(routeId, api) : []),
        [routeId],
    );

    const [selectedId,    setSelectedId]    = React.useState(null);
    const [hoveredRouteId, setHoveredRouteId] = React.useState(null);

    // Auto-select the first station; reset when the route changes
    React.useEffect(() => {
        setSelectedId(stations[0]?.id ?? null);
    }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Honour an external selection (e.g. from StationFlow bar click)
    React.useEffect(() => {
        if (!externalStationId) return;
        if (stations.some(s => s.id === externalStationId)) {
            setSelectedId(externalStationId);
        }
    }, [externalStationId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear hover when the selected station changes
    React.useEffect(() => {
        setHoveredRouteId(null);
    }, [selectedId]);

    // ── Hub resolution ────────────────────────────────────────────────────────
    // Zustand: use the full station group so all connecting routes are visible.
    // Fallback: include the selected station + any nearby transfer station IDs
    //           (nearbyStations walking-time heuristic).
    const stationIds = React.useMemo(() => {
        if (!selectedId) return [];

        if (isZustandAvailable()) {
            return getGroupForStation(selectedId)?.stationIds ?? [selectedId];
        }

        // Fallback: gather sibling station IDs via nearbyStations
        const allStations = api.gameState.getStations();
        const station     = allStations.find(s => s.id === selectedId);
        const nearbyIds   = (station?.nearbyStations ?? [])
            .filter(ns => ns.walkingTime < CONFIG.TRANSFER_WALKING_TIME_THRESHOLD)
            .map(ns => ns.stationId);
        return [selectedId, ...nearbyIds];
    }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

    const routesData     = useTransferFlowData(stationIds);
    const selectedStation = stations.find(s => s.id === selectedId);

    if (stations.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No stations found for this route
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* ── Legend (top) ── */}
            {routesData && (
                <TransferFlowLegend
                    routesData={routesData}
                    hoveredRouteId={hoveredRouteId}
                    onHover={setHoveredRouteId}
                    onLeave={() => setHoveredRouteId(null)}
                    currentRouteId={routeId}
                />
            )}

            {/* ── Chart + Station Strip ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {!routesData ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Loading…
                    </div>
                ) : (
                    <TransferSankey
                        routesData={routesData}
                        groupName={selectedStation?.name ?? ''}
                        hoveredRouteId={hoveredRouteId}
                    />
                )}

                <div className="pt-8 px-8">
                    <StationStrip
                        stations={stations}
                        selectedId={selectedId}
                        routeColor={routeColor}
                        onSelect={setSelectedId}
                        routeId={routeId}
                    />
                </div>
            </div>
        </div>
    );
}
