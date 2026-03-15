// System Map Component — Tangled-Tree schematic map
//
// KEY VISUAL PRINCIPLES:
//
// 1. PER-ROUTE HUB MEETING POINTS
//    Every route visiting a hub gets its OWN Y coordinate at that hub ("meeting Y"),
//    stacked vertically in the hub column.  Spacing between stacked points =
//    routeStroke + outlineWidth (= 7 px), so no two route outlines ever overlap
//    at a hub.  Routes converge TOWARD each other at hubs but never collapse into
//    a single pixel, which preserves visual identity and makes the outline trick work.
//
// 2. PER-ROUTE OUTLINE RENDERING
//    Each route is drawn as TWO paths inside its own <g> — first the outline
//    (background-coloured, wider stroke) then the colour stroke on top.  Because
//    the <g> elements are ordered, each route renders "above" the previous one,
//    making its outline cut cleanly through any earlier route's coloured stroke.
//    This is identical to the technique used in the Observable reference.
//
// 3. HUB SPINE PROPORTIONAL TO ROUTE COUNT
//    The vertical spine at each hub spans exactly from the topmost to the
//    bottommost meeting Y, so a 2-route hub has a short spine and a 10-route hub
//    has a tall one — matching the Zeus example in the reference.

import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import { getStationTransferRoutes } from '../../utils/transfer-utils.js';
import { getStationGroups, isZustandAvailable } from '../../core/api-support.js';
import { Dropdown } from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { RouteBadge } from '../../components/route-badge.jsx';
import { getStorage } from '../../core/lifecycle.js';
import { loadPrefs, savePrefs } from '../../hooks/useUIPreferences.js';
import { Portal } from '../../hooks/portal.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ─────────────────────────────────────────────────────────────
// LAYOUT CONSTANTS
// ─────────────────────────────────────────────────────────────

const BASE_COL_W    = 50;  // minimum px between hub columns (grows to fill container)
const MIN_ROW_H     = 48;   // minimum swimlane height
const MAX_ROW_H     = 54;   // maximum swimlane height cap
const LABEL_W       = 100;  // left-margin width for route labels
const RIGHT_PAD     = 0;   // right-edge padding
const TOP_PAD       = 0;   // top margin reserved for hub name labels
const BOT_PAD       = 0;
const TAIL          = 50;   // px of tail beyond first/last hub column

// Stroke widths
const ROUTE_STROKE  = 3;    // coloured route stroke width (px)
const OUTLINE_EXTRA = 4;    // outline stroke = ROUTE_STROKE + OUTLINE_EXTRA
// Minimum spacing between stacked meeting points (hard floor for outline safety).
// Actual spacing is computed per-layout as max(MIN_POINT_SPACING, rowH × 0.28)
// so it scales with route density and keeps convergence curves proportionate.
const MIN_POINT_SPACING = ROUTE_STROKE + OUTLINE_EXTRA; // 7 px

// Horizontal padding inside the SVG container div (p-4 = 1rem each side = 32 px total).
// Subtracted from containerWidth so the layout engine and scroll threshold both
// operate on the actual SVG viewport width rather than the padded outer div.
const SVG_CONTAINER_PAD_X = 32;

// ─────────────────────────────────────────────────────────────
// TRANSFER MAP
// ─────────────────────────────────────────────────────────────

function buildTransferMap(routes, stationsByRoute, api) {
    const allStations = api.gameState.getStations();

    const stationToGroup = {};
    if (isZustandAvailable()) {
        getStationGroups().forEach(group => {
            group.stationIds.forEach(sid => { stationToGroup[sid] = group.id; });
        });
    }
    allStations.forEach(s => {
        if (!stationToGroup[s.id]) stationToGroup[s.id] = s.id;
    });

    const groupToRoutes  = {};
    const groupCanonical = {};

    routes.forEach(route => {
        (stationsByRoute[route.id] || []).forEach(stId => {
            const connectedRoutes = getStationTransferRoutes(stId, route.id, api);
            if (!connectedRoutes.length) return;
            const groupId = stationToGroup[stId] || stId;
            if (!groupToRoutes[groupId]) {
                groupToRoutes[groupId]  = new Set();
                groupCanonical[groupId] = stId;
            }
            groupToRoutes[groupId].add(route.id);
            connectedRoutes.forEach(tr => groupToRoutes[groupId].add(tr.routeId));
        });
    });

    const transferMap = {};
    Object.entries(groupToRoutes).forEach(([groupId, routeIdSet]) => {
        if (routeIdSet.size < 2) return;
        const canonicalId = groupCanonical[groupId];
        const station     = allStations.find(s => s.id === canonicalId);
        transferMap[groupId] = {
            canonicalStationId: canonicalId,
            routeIds: Array.from(routeIdSet),
            name: station?.name || 'Transfer',
        };
    });

    return transferMap;
}

// ─────────────────────────────────────────────────────────────
// TANGLED-TREE LAYOUT ENGINE
// ─────────────────────────────────────────────────────────────

function buildStationToGroup(transferMap) {
    const map = {};
    const zustandGroups = isZustandAvailable() ? getStationGroups() : [];
    Object.entries(transferMap).forEach(([groupId, data]) => {
        map[data.canonicalStationId] = groupId;
        const zg = zustandGroups.find(g => g.id === groupId);
        if (zg) zg.stationIds.forEach(sid => { map[sid] = groupId; });
    });
    return map;
}

function buildRouteHubSeqs(routes, stationsByRoute, stationToGroup) {
    const seqs = {};
    routes.forEach(route => {
        const seen = [];
        (stationsByRoute[route.id] || []).forEach(stId => {
            const gid = stationToGroup[stId];
            if (gid && seen[seen.length - 1] !== gid) seen.push(gid);
        });
        seqs[route.id] = seen;
    });
    return seqs;
}

function topoSortHubs(allGroupIds, routes, routeHubSeqs) {
    const edgeVotes = {};
    allGroupIds.forEach(id => { edgeVotes[id] = {}; });
    routes.forEach(route => {
        const seq = routeHubSeqs[route.id] || [];
        for (let i = 0; i < seq.length - 1; i++) {
            const from = seq[i], to = seq[i + 1];
            if (!edgeVotes[from]) edgeVotes[from] = {};
            edgeVotes[from][to] = (edgeVotes[from][to] || 0) + 1;
        }
    });

    const adj   = Object.fromEntries(allGroupIds.map(id => [id, []]));
    const inDeg = Object.fromEntries(allGroupIds.map(id => [id, 0]));
    allGroupIds.forEach(from => {
        Object.entries(edgeVotes[from] || {}).forEach(([to, fwd]) => {
            const bwd = edgeVotes[to]?.[from] || 0;
            if (fwd > bwd) { adj[from].push(to); inDeg[to] = (inDeg[to] || 0) + 1; }
        });
    });

    const naturalPos = {};
    allGroupIds.forEach(id => {
        const xs = routes.flatMap(r => {
            const seq = routeHubSeqs[r.id] || [];
            const idx = seq.indexOf(id);
            return idx >= 0 ? [seq.length <= 1 ? 0.5 : idx / (seq.length - 1)] : [];
        });
        xs.sort((a, b) => a - b);
        naturalPos[id] = xs.length === 0 ? 0.5 : xs[Math.floor(xs.length / 2)];
    });

    const order = [];
    let queue = allGroupIds.filter(id => (inDeg[id] || 0) === 0);
    queue.sort((a, b) => naturalPos[a] - naturalPos[b]);
    while (queue.length) {
        const node = queue.shift();
        order.push(node);
        (adj[node] || []).forEach(nb => {
            inDeg[nb]--;
            if (inDeg[nb] === 0) queue.push(nb);
        });
        queue.sort((a, b) => naturalPos[a] - naturalPos[b]);
    }
    allGroupIds
        .filter(id => !order.includes(id))
        .sort((a, b) => naturalPos[a] - naturalPos[b])
        .forEach(id => order.push(id));
    return order;
}

function sortRoutesForLayout(routes, routeHubSeqs, orderedHubs) {
    const hubRank = Object.fromEntries(orderedHubs.map((id, i) => [id, i]));
    return [...routes].sort((a, b) => {
        const sa = (routeHubSeqs[a.id] || []).map(h => hubRank[h] ?? 9999);
        const sb = (routeHubSeqs[b.id] || []).map(h => hubRank[h] ?? 9999);
        for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
            const d = (sa[i] ?? 99999) - (sb[i] ?? 99999);
            if (d !== 0) return d;
        }
        return 0;
    });
}

// ── Main layout ──────────────────────────────────────────────
// Returns complete position/path descriptors for all routes and hubs.
function buildTangledLayout(routes, transferMap, stationsByRoute, allTransferMap, containerWidth = 800) {
    const stationToGroup = buildStationToGroup(transferMap);
    const routeHubSeqs   = buildRouteHubSeqs(routes, stationsByRoute, stationToGroup);

    const allGroupIds = Object.keys(transferMap);
    const orderedHubs = allGroupIds.length
        ? topoSortHubs(allGroupIds, routes, routeHubSeqs)
        : [];

    // Re-sort each route's hub sequence by column rank so paths travel L→R.
    const hubRank = Object.fromEntries(orderedHubs.map((id, i) => [id, i]));
    Object.keys(routeHubSeqs).forEach(rid => {
        routeHubSeqs[rid].sort((a, b) => (hubRank[a] ?? 999) - (hubRank[b] ?? 999));
    });

    const sortedRoutes = sortRoutesForLayout(routes, routeHubSeqs, orderedHubs);
    const nHubs   = orderedHubs.length;
    const nRoutes = sortedRoutes.length;

    // Adaptive column width — spread hubs to fill available container width.
    const availableForCols = containerWidth - LABEL_W - 2 * TAIL - RIGHT_PAD;
    const colW = nHubs > 1
        ? Math.max(BASE_COL_W, Math.round(availableForCols / (nHubs - 1)))
        : BASE_COL_W;

    // Adaptive row height.
    const targetH = Math.max(220, 42 * nRoutes);
    const rowH    = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H,
        Math.round((targetH - TOP_PAD - BOT_PAD) / Math.max(nRoutes, 1))
    ));

    // Adaptive point spacing — scales with rowH so convergence curves stay
    // proportionate regardless of route count.
    // At  6 routes (rowH≈28): 28×0.28≈8  → barely more than the 7px minimum.
    // At 50 routes (rowH≈41): 41×0.28≈12 → gentler funnels, less spaghetti.
    const pointSpacing = Math.max(MIN_POINT_SPACING, Math.round(rowH * 0.28));

    const canvasW = nHubs > 1
        ? LABEL_W + TAIL + (nHubs - 1) * colW + TAIL + RIGHT_PAD
        : containerWidth;
    const canvasH = TOP_PAD + nRoutes * rowH + BOT_PAD;

    const hubX = Object.fromEntries(
        orderedHubs.map((id, i) => [id, LABEL_W + TAIL + i * colW])
    );

    // Route base Y: vertical centre of each swimlane.
    const routeBaseY = Object.fromEntries(
        sortedRoutes.map((r, i) => [r.id, TOP_PAD + i * rowH + rowH / 2])
    );

    // ── PER-ROUTE HUB MEETING POINTS ────────────────────────────────────────
    // Each hub column holds a vertical stack of one meeting point per visiting
    // route.  Points are ordered top-to-bottom matching the routes' swimlane
    // order.  The stack is centred on the average base Y of visiting routes.
    // Spacing = POINT_SPACING (7 px) guarantees outlines never overlap.
    //
    // routeHubMeetY[routeId][hubId] = the Y this route passes through at this hub.
    const routeHubMeetY = {};

    // Also precompute per-hub info needed for hub node rendering.
    const hubNodeInfo = {};

    orderedHubs.forEach(gid => {
        const visitors = sortedRoutes.filter(r => (routeHubSeqs[r.id] || []).includes(gid));
        if (!visitors.length) return;

        const n = visitors.length;
        // Sort visitors by base Y so top-lane routes get top meeting points.
        const sorted = [...visitors].sort((a, b) => routeBaseY[a.id] - routeBaseY[b.id]);
        const centerY = sorted.reduce((s, r) => s + routeBaseY[r.id], 0) / n;

        const meetYByRoute = {};
        sorted.forEach((route, i) => {
            const meetY = centerY + (i - (n - 1) / 2) * pointSpacing;
            meetYByRoute[route.id] = meetY;
            if (!routeHubMeetY[route.id]) routeHubMeetY[route.id] = {};
            routeHubMeetY[route.id][gid] = meetY;
        });

        const allMeetYs = Object.values(meetYByRoute);
        hubNodeInfo[gid] = {
            centerY,
            meetYByRoute,
            spineTop: Math.min(...allMeetYs),
            spineBot: Math.max(...allMeetYs),
            visitingRouteIds: sorted.map(r => r.id),
        };
    });

    // ── SVG PATHS ────────────────────────────────────────────────────────────
    // Each segment is a cubic bezier with horizontal tangents:
    //   C midX srcY,  midX dstY,  dstX dstY
    // This gives smooth S-curves that stay near srcY for the first half,
    // then transition to dstY in the second half.
    const routePaths = sortedRoutes.map(route => {
        const hubs = routeHubSeqs[route.id] || [];
        const ry   = routeBaseY[route.id];

        if (!hubs.length) {
            return { id: route.id, color: route.color || '#888', d: `M ${LABEL_W} ${ry} H ${canvasW}` };
        }

        const firstHub   = hubs[0];
        const lastHub    = hubs[hubs.length - 1];
        const firstMeetY = routeHubMeetY[route.id]?.[firstHub] ?? ry;
        const lastMeetY  = routeHubMeetY[route.id]?.[lastHub]  ?? ry;

        // Left tail: base Y → first hub meeting Y
        const lx0 = LABEL_W, lx1 = hubX[firstHub];
        const lmx = (lx0 + lx1) / 2;
        let d = `M ${lx0} ${ry} C ${lmx} ${ry} ${lmx} ${firstMeetY} ${lx1} ${firstMeetY}`;

        // Hub-to-hub segments
        for (let i = 0; i < hubs.length - 1; i++) {
            const A = hubs[i], B = hubs[i + 1];
            const yA = routeHubMeetY[route.id]?.[A] ?? ry;
            const yB = routeHubMeetY[route.id]?.[B] ?? ry;
            const x0 = hubX[A], x1 = hubX[B];
            const mx = (x0 + x1) / 2;
            d += ` C ${mx} ${yA} ${mx} ${yB} ${x1} ${yB}`;
        }

        // Right tail: last hub meeting Y → base Y
        const rx0 = hubX[lastHub], rx1 = rx0 + TAIL;
        const rmx = (rx0 + rx1) / 2;
        d += ` C ${rmx} ${lastMeetY} ${rmx} ${ry} ${rx1} ${ry}`;
        d += ` H ${canvasW}`;

        return { id: route.id, color: route.color || '#888', d };
    });

    // ── TRANSFER DOT DESCRIPTORS ─────────────────────────────────────────────
    const transferDots = orderedHubs.map(gid => {
        const data = transferMap[gid];
        if (!data || !hubNodeInfo[gid]) return null;
        const info = hubNodeInfo[gid];
        const fullRouteIds = allTransferMap?.[gid]?.routeIds ?? data.routeIds;
        return {
            groupId:  gid,
            name:     data.name,
            px:       hubX[gid],
            centerY:  info.centerY,        // center of stacked meeting points (interchange ring)
            spineTop: info.spineTop,       // topmost meeting Y (spine start)
            spineBot: info.spineBot,       // bottommost meeting Y (spine end)
            meetYByRoute: info.meetYByRoute, // { routeId: meetY } for coloured circles
            visitingRouteIds: info.visitingRouteIds,
            routeIds: fullRouteIds,
            rowH,
        };
    }).filter(Boolean);

    return { canvasW, canvasH, rowH, routePaths, transferDots, sortedRoutes, routeBaseY };
}

// ─────────────────────────────────────────────────────────────
// HOOK — raw game data (layout computed in component)
// ─────────────────────────────────────────────────────────────

function useRawMapData(selectedRouteIds) {
    const [rawData, setRawData] = React.useState(null);
    const filterKey = selectedRouteIds ? selectedRouteIds.slice().sort().join(',') : null;

    React.useEffect(() => {
        function update() {
            try {
                const allRoutes = api.gameState.getRoutes();
                const stations  = api.gameState.getStations();
                if (!allRoutes.length) { setRawData(null); return; }

                const routes = selectedRouteIds && selectedRouteIds.length > 0
                    ? allRoutes.filter(r => selectedRouteIds.includes(r.id))
                    : allRoutes;

                if (!routes.length) {
                    setRawData(prev => prev ? { ...prev, routes: [] } : null);
                    return;
                }

                const stationsByRoute = {};
                routes.forEach(route => {
                    const ordered = getRouteStationsInOrder(route.id, api);
                    stationsByRoute[route.id] = ordered.map(s => s.id);
                });

                const stationNames = {};
                stations.forEach(s => { stationNames[s.id] = s.name || 'Station'; });

                const transferMap = buildTransferMap(routes, stationsByRoute, api);

                // Keep only hubs where ≥2 of the CURRENTLY RENDERED routes connect.
                // buildTransferMap collects all routes at each station (including ones
                // not in the rendered set), so a hub like "Station Y" that connects
                // rendered route "a" with non-rendered route "z" would otherwise appear
                // as a dead-end marker on the map.  We remove such hubs here.
                const renderedIds = new Set(routes.map(r => r.id));
                Object.keys(transferMap).forEach(gid => {
                    const n = (transferMap[gid].routeIds || [])
                        .filter(id => renderedIds.has(id)).length;
                    if (n < 2) delete transferMap[gid];
                });

                const allStationsByRoute = {};
                allRoutes.forEach(route => {
                    allStationsByRoute[route.id] = stationsByRoute[route.id]
                        ?? getRouteStationsInOrder(route.id, api).map(s => s.id);
                });
                const allTransferMap = buildTransferMap(allRoutes, allStationsByRoute, api);

                setRawData({ routes, allRoutes, transferMap, allTransferMap, stationsByRoute, stationNames });

            } catch (err) {
                console.error('[DashboardMap] Error fetching map data:', err);
                setRawData(null);
            }
        }

        update();
        const interval = setInterval(update, 5000);
        return () => clearInterval(interval);
    }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

    return rawData;
}

// ─────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────

function MapTooltip({ data, mapData }) {
    if (!data || !mapData) return null;
    const { groupId, x, y } = data;
    const { transferMap, allRoutes } = mapData;
    const entry = transferMap[groupId];
    if (!entry) return null;

    return (
        <Portal>
            <div
                className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg"
                style={{ position: 'fixed', left: x, top: y, transform: 'translateY(-125%)', zIndex: 9999 }}
            >
                <div className="font-semibold text-xs mb-1">{entry.name}</div>
                <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-border">
                    {entry.routeIds.map(rid => {
                        const route = (allRoutes ?? []).find(r => r.id === rid);
                        return (
                            <div key={rid} className="flex items-center gap-1.5">
                                <RouteBadge routeId={rid} size="1.2rem" interactive={false} />
                                <span className="text-[10px] text-muted-foreground">
                                    {route?.name || route?.bullet || rid}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Portal>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function DashboardMap() {
    const [selectedRoutes, setSelectedRoutes] = React.useState([]);

    const storage        = getStorage();
    const [prefsLoaded, setPrefsLoaded] = React.useState(false);
    const prefsSaveable  = React.useRef(false);

    // Container width — measured via a callback ref so it works regardless of
    // which conditional branch is currently rendered (loading, empty, or main SVG).
    //
    // useRef + useLayoutEffect(fn, []) only fires once on initial mount. If the
    // component first renders in a loading or "no routes" state, the SVG wrapper
    // div (where the old ref lived) is not in the DOM yet, so the observer was
    // never set up and containerWidth stayed at a stale initial value forever.
    //
    // A callback ref fires every time the element mounts or unmounts, so the
    // ResizeObserver is always attached to whichever div is currently in the DOM.
    const [containerWidth, setContainerWidth] = React.useState(0);
    const _roRef  = React.useRef(null);
    const _rafRef = React.useRef(null);
    const containerRef = React.useCallback(el => {
        // Tear down the previous observer whenever the element changes.
        if (_roRef.current) { _roRef.current.disconnect(); _roRef.current = null; }
        cancelAnimationFrame(_rafRef.current);
        if (!el) return;
        // Measure synchronously so the first paint already uses the correct width.
        const w = el.getBoundingClientRect().width;
        if (w > 0) setContainerWidth(w);
        // Coalesce rapid ResizeObserver callbacks (e.g. panel drag) to one rAF.
        const ro = new ResizeObserver(entries => {
            cancelAnimationFrame(_rafRef.current);
            _rafRef.current = requestAnimationFrame(() => {
                const cw = entries[0].contentRect.width;
                if (cw > 0) setContainerWidth(cw);
            });
        });
        ro.observe(el);
        _roRef.current = ro;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filterArg = selectedRoutes.length > 0 ? selectedRoutes : null;
    const rawData   = useRawMapData(filterArg);

    const layout = React.useMemo(() => {
        if (!rawData?.routes?.length || containerWidth <= 0) return null;
        return buildTangledLayout(
            rawData.routes, rawData.transferMap,
            rawData.stationsByRoute, rawData.allTransferMap,
            containerWidth - SVG_CONTAINER_PAD_X
        );
    }, [rawData, containerWidth]);

    const mapData = rawData && layout ? (() => {
        const { canvasW, canvasH, rowH, routePaths, transferDots, sortedRoutes, routeBaseY } = layout;
        const renderedRoutes = sortedRoutes.map(route => {
            const path = routePaths.find(p => p.id === route.id);
            return {
                id:    route.id,
                name:  route.name   || route.bullet || route.id,
                color: route.color  || '#888888',
                path:  path?.d ?? '',
                y:     routeBaseY[route.id],
            };
        });
        return {
            renderedRoutes, transferDots,
            transferMap: rawData.allTransferMap,
            stationNames: rawData.stationNames,
            routes: rawData.routes, allRoutes: rawData.allRoutes,
            canvasW, canvasH, rowH,
        };
    })() : null;

    const allRoutes   = rawData?.allRoutes ?? [];
    const allRouteIds = React.useMemo(
        () => allRoutes.map(r => r.id),
        [allRoutes.map(r => r.id).join(',')]
    );

    // Set of route IDs that participate in at least one transfer hub.
    // Used to filter the route selector dropdown — non-transfer routes are hidden.
    const transferRouteIds = React.useMemo(() => {
        const ids = new Set();
        Object.values(rawData?.allTransferMap ?? {}).forEach(hub => {
            hub.routeIds?.forEach(id => ids.add(id));
        });
        return ids;
    }, [rawData?.allTransferMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Prefs load
    React.useEffect(() => {
        if (prefsSaveable.current) return;
        const doLoad = async () => {
            if (storage) {
                const prefs = await loadPrefs(storage, 'dashboardMap');
                if (Array.isArray(prefs.selectedRoutes) && prefs.selectedRoutes.length > 0) {
                    const validIds = new Set(api.gameState.getRoutes().map(r => r.id));
                    const filtered = prefs.selectedRoutes.filter(id => validIds.has(id));
                    if (filtered.length > 0) setSelectedRoutes(filtered);
                }
            }
            prefsSaveable.current = true;
            setPrefsLoaded(true);
        };
        doLoad();
    }, [storage]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (!prefsLoaded || allRouteIds.length === 0) return;
        setSelectedRoutes(prev => {
            if (prev.length === 0) return allRouteIds;
            const filtered = prev.filter(id => allRouteIds.includes(id));
            return filtered.length === prev.length ? prev : filtered;
        });
    }, [allRouteIds.join(','), prefsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    // Prefs save
    React.useEffect(() => {
        if (!prefsSaveable.current || !storage) return;
        savePrefs(storage, 'dashboardMap', { selectedRoutes });
    }, [storage, selectedRoutes]); // eslint-disable-line react-hooks/exhaustive-deps

    // Hover state
    const [hoveredRoute,    setHoveredRoute]    = React.useState(null);
    const [hoveredTransfer, setHoveredTransfer] = React.useState(null);
    const [tooltip,         setTooltip]         = React.useState(null);

    // ── Hoist mapData destructure with safe defaults ──────────────────────────
    // All variables are defined unconditionally so early-return branches and the
    // main render branch share one outer wrapper div with `containerRef` — which
    // is required for the ResizeObserver to always be attached to a live element.
    const {
        renderedRoutes = [], transferDots = [], routes = [],
        canvasW = 0, canvasH = 0, rowH = 0,
    } = mapData || {};

    const hasRoutes = renderedRoutes.length > 0;

    // Highlight helpers (safe to call even when renderedRoutes is empty)
    const activeRouteIds = hoveredTransfer
        ? new Set(transferDots.find(d => d.groupId === hoveredTransfer)?.routeIds ?? [])
        : hoveredRoute
            ? new Set([hoveredRoute])
            : null;

    const routeOpacity = rid => !activeRouteIds ? 1 : activeRouteIds.has(rid) ? 1 : 0.06;
    const routeStroke  = rid => !activeRouteIds
        ? ROUTE_STROKE
        : activeRouteIds.has(rid) ? ROUTE_STROKE + 1.5 : ROUTE_STROKE * 0.6;
    const routeFilter  = rid => {
        if (!activeRouteIds || !activeRouteIds.has(rid)) return 'none';
        const c = routes.find(r => r.id === rid)?.color ?? '#888';
        return `drop-shadow(0 0 6px ${c}90)`;
    };
    const hubOpacity = ({ groupId, routeIds }) => {
        if (hoveredTransfer) return groupId === hoveredTransfer ? 1 : 0.06;
        if (!activeRouteIds) return 1;
        return routeIds.some(rid => activeRouteIds.has(rid)) ? 1 : 0.06;
    };

    const removeRoute = (e, rid) => {
        e.stopPropagation();
        setSelectedRoutes(prev => prev.filter(id => id !== rid));
    };

    // Single return — outermost div always mounts so containerRef (callback ref)
    // always has an element to observe, regardless of loading / empty state.
    return (
        <div ref={containerRef} className="space-y-3">

            {/* ── Loading / no data ───────────────────────────── */}
            {!mapData && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-muted-foreground mb-2 text-sm">Generating system map…</div>
                    <div className="text-xs text-muted-foreground">Build routes and stations to see the network map</div>
                </div>
            )}

            {/* ── Top bar (shown when data is available) ──────── */}
            {mapData && (
                <div className="flex gap-3">
                    <Dropdown
                        togglerText={`${selectedRoutes.length}/${allRouteIds.length}`}
                        togglerIcon={icons.Route}
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[180px]"
                        multiselect={true}
                        value={selectedRoutes}
                        onChange={setSelectedRoutes}
                    >
                        {allRoutes
                            .filter(route => transferRouteIds.has(route.id))
                            .map(route => (
                                <DropdownItem key={route.id} route={route} value={route.id} />
                            ))}
                    </Dropdown>

                    {hasRoutes && (
                        <div className="flex gap-1 flex-wrap">
                            {selectedRoutes.map(rid => (
                                <div
                                    key={rid}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background/80 cursor-pointer"
                                    style={{
                                        opacity: activeRouteIds && !activeRouteIds.has(rid) ? 0.35 : 1,
                                        transition: 'opacity 0.15s',
                                    }}
                                    onMouseEnter={() => { setHoveredRoute(rid); setHoveredTransfer(null); }}
                                    onMouseLeave={() => setHoveredRoute(null)}
                                >
                                    <RouteBadge routeId={rid} size={selectedRoutes.length > 10 ? '1rem' : '1.2rem'} interactive={false} />
                                    <button
                                        onClick={e => removeRoute(e, rid)}
                                        style={{ opacity: hoveredRoute === rid ? 1 : 0.5 }}
                                        title="Remove"
                                    >
                                        <icons.X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── No routes selected ──────────────────────────── */}
            {mapData && selectedRoutes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-background/50">
                    <div className="text-muted-foreground mb-1 text-sm">No routes selected</div>
                    <div className="text-xs text-muted-foreground">Select at least one route to see the map</div>
                </div>
            )}

            {/* ── Routes selected but no renderable data ──────── */}
            {!mapData || selectedRoutes.length > 0 || !hasRoutes && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-muted-foreground text-sm">No route data available</div>
                </div>
            )}

            {/* ── SVG map ─────────────────────────────────────── */}
            {/*
                When canvasW fits inside the container (≤6 hubs for typical widths),
                the SVG fills its container via width="100%".

                When canvasW exceeds the container (many hubs with large networks),
                we switch to a fixed-pixel SVG width and enable horizontal scrolling.
                Without this, the browser would scale the SVG down to fit the container
                width while respecting aspect ratio — shrinking height proportionally too
                and making routes razor-thin (e.g. a 4344×2116 viewBox in a 1100px
                container would render at ~535px tall instead of 2116px).
            */}
            {hasRoutes && selectedRoutes.length > 0 && (
                <div
                    className="rounded-lg border border-border bg-background/50 p-4 pl-3"
                    style={{ overflowX: canvasW > containerWidth - SVG_CONTAINER_PAD_X ? 'auto' : 'hidden' }}
                >
                    <svg
                        viewBox={`0 0 ${canvasW} ${canvasH}`}
                        width={canvasW > containerWidth - SVG_CONTAINER_PAD_X ? canvasW : '100%'}
                        height={canvasH}
                        style={{ display: 'block' }}
                    >
                        {/* ── LAYER 1: Swimlane background stripes ── */}
                        {renderedRoutes.map((route, i) => (
                            <rect
                                key={`stripe-${route.id}`}
                                x={0} y={TOP_PAD + i * rowH}
                                width={canvasW} height={rowH}
                                fill={i % 2 === 0 ? 'currentColor' : 'transparent'}
                                fillOpacity={0.012}
                            />
                        ))}

                        {/* ── LAYER 2: Hub spines (behind routes) ── */}
                        {/* Each spine spans from topmost to bottommost meeting Y for this hub.
                            Spine height is therefore proportional to the number of routes. */}
                        {transferDots.map(dot => {
                            const { groupId, px, spineTop, spineBot } = dot;
                            const op = hubOpacity(dot);
                            return (
                                <g key={`spine-${groupId}`} style={{ opacity: op, transition: 'opacity 0.15s' }}>
                                    {/* Outline (background colour, wide) so spine gets the same
                                        visual separation treatment as route paths. */}
                                    <line
                                        x1={px} y1={spineTop} x2={px} y2={spineBot}
                                        stroke="hsl(var(--background))"
                                        strokeWidth={ROUTE_STROKE + OUTLINE_EXTRA + 2}
                                        strokeLinecap="round"
                                    />
                                    {/* Visible spine */}
                                    <line
                                        x1={px} y1={spineTop} x2={px} y2={spineBot}
                                        stroke="hsl(var(--muted-foreground))"
                                        strokeWidth={1.5}
                                        strokeOpacity={0.5}
                                        strokeLinecap="round"
                                    />
                                </g>
                            );
                        })}

                        {/* ── LAYER 3 + 4: Route paths (per-route outline → colour) ──
                            CRITICAL ORDERING: each <g> draws one route's outline THEN its
                            colour stroke.  Because SVG paints in document order, every
                            subsequent route's background outline will cut through the
                            coloured strokes of all earlier routes — producing the clean
                            "route B on top of route A" separation seen in the reference. */}
                        {renderedRoutes.map(route => {
                            const op  = routeOpacity(route.id);
                            const sw  = routeStroke(route.id);
                            const fil = routeFilter(route.id);
                            return (
                                <g key={`route-${route.id}`}>
                                    {/* Outline pass — background colour, wider */}
                                    <path
                                        d={route.path}
                                        fill="none"
                                        stroke="hsl(var(--background))"
                                        strokeWidth={sw + OUTLINE_EXTRA}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ opacity: op, transition: 'opacity 0.15s' }}
                                    />
                                    {/* Colour pass */}
                                    <path
                                        d={route.path}
                                        fill="none"
                                        stroke={route.color}
                                        strokeWidth={sw}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{
                                            opacity: op,
                                            filter: fil,
                                            transition: 'stroke-width 0.15s, opacity 0.15s',
                                            cursor: 'pointer',
                                        }}
                                        onMouseEnter={() => { setHoveredRoute(route.id); setHoveredTransfer(null); }}
                                        onMouseLeave={() => setHoveredRoute(null)}
                                    />
                                </g>
                            );
                        })}

                        {/* ── LAYER 5: Hub node markers ── */}
                        {/* For each hub:
                            • Coloured circle at each route's meeting Y (exact position on path)
                            • White interchange ring at hub centerY (average of meeting Ys)
                            • Hub name label above the spine
                            • Transparent hit area */}
                        {transferDots.map(dot => {
                            const {
                                groupId, name, px, centerY,
                                spineTop, spineBot,
                                meetYByRoute, visitingRouteIds, routeIds,
                            } = dot;
                            const isHovered = hoveredTransfer === groupId;
                            const op        = hubOpacity(dot);
                            const nVisiting = visitingRouteIds.length;

                            return (
                                <g
                                    key={`hub-${groupId}`}
                                    style={{ opacity: op, transition: 'opacity 0.15s', cursor: 'pointer' }}
                                    onMouseEnter={e => {
                                        setHoveredTransfer(groupId);
                                        setHoveredRoute(null);
                                        setTooltip({ groupId, x: e.clientX, y: e.clientY });
                                    }}
                                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                                    onMouseLeave={() => { setHoveredTransfer(null); setTooltip(null); }}
                                >
                                    {/* Transparent hit area */}
                                    <rect
                                        x={px - 18} y={spineTop - 10}
                                        width={36}  height={spineBot - spineTop + 20}
                                        fill="transparent"
                                    />

                                    {/* Coloured circles at each route's meeting Y.
                                        These are exactly where the route path IS at this hub column. */}
                                    {visitingRouteIds.map(rid => {
                                        const r  = routes.find(ro => ro.id === rid);
                                        const my = meetYByRoute[rid];
                                        if (my === undefined) return null;
                                        return (
                                            <circle
                                                key={`meet-${rid}`}
                                                cx={px} cy={my}
                                                r={ROUTE_STROKE - 0.5}
                                                fill={r?.color || '#888'}
                                                stroke="hsl(var(--background))"
                                                strokeWidth={1}
                                            />
                                        );
                                    })}

                                    {/* Interchange ring at the hub centre Y */}
                                    <circle
                                        cx={px} cy={centerY}
                                        r={isHovered ? 7 : 5.5}
                                        fill="hsl(var(--background))"
                                        stroke="hsl(var(--foreground))"
                                        strokeWidth={isHovered ? 2 : 1.5}
                                        strokeOpacity={isHovered ? 0.9 : 0.6}
                                    />

                                    {/* Hub name label above the spine */}
                                    <text
                                        x={px}
                                        y={spineTop - 8}
                                        textAnchor="middle"
                                        fontSize={nVisiting > 4 ? 7 : 10}
                                        fontWeight={isHovered ? '600' : '400'}
                                        paintOrder="stroke"
                                        stroke="hsl(var(--background))"
                                        strokeWidth="3px"
                                        strokeLinecap="butt"
                                        strokeLinejoin="miter"
                                        fill="var(--aa-chart-secondary-metric)"
                                        style={{ letterSpacing: '0.06em', pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {name.length > 14 ? name.slice(0, 13) + '…' : name.toUpperCase()}
                                    </text>
                                </g>
                            );
                        })}

                        {/* ── LAYER 6: Route labels (left margin) ── */}
                        {renderedRoutes.map(route => (
                            <g
                                key={`label-${route.id}`}
                                style={{ opacity: routeOpacity(route.id), transition: 'opacity 0.15s', cursor: 'pointer' }}
                                onMouseEnter={() => { setHoveredRoute(route.id); setHoveredTransfer(null); }}
                                onMouseLeave={() => setHoveredRoute(null)}
                            >
                                <rect
                                    x={4}
                                    y={route.y - Math.min(rowH * 0.35, 8)}
                                    width={5}
                                    height={Math.min(rowH * 0.7, 16)}
                                    rx={2}
                                    fill={route.color}
                                />
                                <text
                                    x={13} y={route.y + 4}
                                    fontSize={9}
                                    fill="hsl(var(--muted-foreground))"
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {(route.name || '').slice(0, 11)}
                                </text>
                            </g>
                        ))}
                    </svg>
                </div>
            )}

            {/* ── Transfer chips ───────────────────────────────── */}
            {hasRoutes && selectedRoutes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {transferDots.map(({ groupId, name, routeIds }) => {
                        const isHovered = hoveredTransfer === groupId;
                        return (
                            <div
                                key={groupId}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/30 text-[10px] cursor-pointer"
                                style={{
                                    borderColor: isHovered ? 'var(--aa-transfer-color)' : 'hsl(var(--border))',
                                    opacity: hoveredTransfer
                                        ? (isHovered ? 1 : 0.2)
                                        : activeRouteIds && !routeIds.some(rid => activeRouteIds.has(rid))
                                            ? 0.2 : 1,
                                    transition: 'opacity 0.15s, border-color 0.15s',
                                }}
                                onMouseEnter={() => { setHoveredTransfer(groupId); setHoveredRoute(null); }}
                                onMouseLeave={() => setHoveredTransfer(null)}
                            >
                                <span className="whitespace-nowrap">{name}</span>
                                <span style={{ color: 'hsl(var(--border))' }}>·</span>
                                {(() => {
                                    const liveRoutes = api.gameState.getRoutes();
                                    return (
                                        <Dropdown
                                            togglerContent={
                                                <span className="text-xs font-semibold tabular-nums">
                                                    {routeIds.length}
                                                </span>
                                            }
                                            togglerClasses="flex items-center gap-1 rounded hover:bg-accent px-1 -ml-1 transition-colors"
                                            onChange={rid => window.AdvancedAnalytics?.openRouteDialog?.(rid)}
                                        >
                                            {routeIds.map(rid => {
                                                const route = liveRoutes.find(r => r.id === rid);
                                                return route ? <DropdownItem key={rid} value={rid} route={route} /> : null;
                                            })}
                                        </Dropdown>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            )}

            <MapTooltip data={tooltip} mapData={mapData} />
        </div>
    );
}
