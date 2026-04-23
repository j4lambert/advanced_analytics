// AdherenceHeatmap — CSS grid showing per-route, per-stop delay colours.
//
// Grid columns: [route badge max-content] [stop cells 1fr] [avg delay 72px] [total delay 72px] [headway 72px]
// The first column auto-sizes to the widest route badge using a single flat CSS grid
// with React.Fragment rows (no wrapper divs, so cells are direct grid children).
//
// Hub strip: chips below the grid. Hovering a chip dims cells that don't
// belong to that hub's stations.

import { CONFIG }              from '../../config.js';
import { formatSecondsAsTime } from '../../utils/formatting.js';
import { Tooltip }             from "../../components/tooltip";
import { RouteBadge }          from '../../components/route-badge.jsx';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const { EARLY_SEC, ON_TIME_SEC, WARNING_SEC } = CONFIG.ADHERENCE_THRESHOLDS;
const { ADHERENCE, HEADWAY } = CONFIG.COLORS;

// ── Cell colour ───────────────────────────────────────────────────────────────

function cellStyle(delaySec) {
    if (delaySec === null) return { backgroundColor: 'rgba(156,163,175,0.2)' };
    if (delaySec >= -EARLY_SEC && delaySec <= ON_TIME_SEC) return {};
    if (delaySec < -EARLY_SEC) return { backgroundColor: 'rgba(96,165,250,0.5)'  };  // blue-400
    if (delaySec <= WARNING_SEC) return { backgroundColor: 'rgba(249,115,22,0.45)' }; // orange-500
    return { backgroundColor: 'rgba(220,38,38,0.75)' };                               // red-600
}

function cellTooltip(stop) {
    if (stop.delaySec === null) return (
        <span className="text-muted-foreground">{stop.stationName} — no data</span>
    );
    const hasBothDirs = stop.fwdDelaySec !== null && stop.revDelaySec !== null;
    return (
        <div>
            <div className="font-semibold mb-1.5">{stop.stationName}</div>
            {hasBothDirs ? (
                <table>
                    <tbody>
                        <tr>
                            <td className="text-muted-foreground pr-3 whitespace-nowrap">→ Outbound</td>
                            <td className={`tabular-nums text-right ${delayColor(stop.fwdDelaySec)}`}>
                                {formatSecondsAsTime(stop.fwdDelaySec, true)}
                            </td>
                        </tr>
                        <tr>
                            <td className="text-muted-foreground pr-3 whitespace-nowrap">← Return</td>
                            <td className={`tabular-nums text-right ${delayColor(stop.revDelaySec)}`}>
                                {formatSecondsAsTime(stop.revDelaySec, true)}
                            </td>
                        </tr>
                        <tr>
                            <td className="text-muted-foreground pr-3 whitespace-nowrap">Combined</td>
                            <td className={`tabular-nums text-right ${delayColor(stop.delaySec)}`}>
                                {formatSecondsAsTime(stop.delaySec, true)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            ) : (
                <span className={`tabular-nums ${delayColor(stop.delaySec)}`}>
                    {formatSecondsAsTime(stop.delaySec, true)}
                </span>
            )}
        </div>
    );
}

// ── Delay labels ──────────────────────────────────────────────────────────────

function delayColor(delaySec) {
    if (delaySec >= -EARLY_SEC && delaySec <= ON_TIME_SEC) return ADHERENCE.ON_TIME;
    if (delaySec < -EARLY_SEC)  return ADHERENCE.EARLY;
    if (delaySec <= WARNING_SEC) return ADHERENCE.SLIGHTLY_LATE;
    return ADHERENCE.LATE;
}

function getHeadwayColor(label) {
    if (label === 'Regular')   return HEADWAY.REGULAR;
    if (label === 'Irregular') return HEADWAY.IRREGULAR;
    if (label === 'Bunching')  return HEADWAY.BUNCHING;
    return '';
}

// ── Cell components ───────────────────────────────────────────────────────────

function AvgDelay({ avgDelaySec }) {
    if (avgDelaySec === null) {
        return <div className="text-[10px] text-muted-foreground text-right">—</div>;
    }
    return (
        <div className={`text-[10px] tabular-nums font-medium text-right ${delayColor(avgDelaySec)}`}>
            {formatSecondsAsTime(avgDelaySec, true)}
        </div>
    );
}

function TotalDelay({ totalDelaySec }) {
    if (totalDelaySec === null) {
        return <div className="text-[10px] text-muted-foreground text-right">—</div>;
    }
    return (
        <div className={`text-[10px] tabular-nums font-medium text-right ${delayColor(totalDelaySec)}`}>
            {formatSecondsAsTime(totalDelaySec, true)}
        </div>
    );
}

function HeadwayCell({ headway }) {
    if (!headway || headway.meanHeadwaySec === null) {
        return <div className="text-[10px] text-muted-foreground text-right">—</div>;
    }
    const tip = (
        <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Headway Regularity</span>
            <span className="text-xs opacity-70">
                Average time between consecutive train arrivals at the first stop.
                Lower variation = more evenly spaced trains.
            </span>
            {headway.cvHeadway != null && (
                <span className="text-xs mt-1">CV: {headway.cvHeadway.toFixed(3)}</span>
            )}
        </div>
    );
    return (
        <Tooltip content={tip} side="left" delay={0}>
            <div className={`text-[10px] tabular-nums font-medium text-right cursor-default ${getHeadwayColor(headway.label)}`}>
                {formatSecondsAsTime(headway.meanHeadwaySec)}
            </div>
        </Tooltip>
    );
}

// ── Hub strip ─────────────────────────────────────────────────────────────────

function HubStrip({ hubAverages, hubFilter, onHubFilterChange, hoveredGroupId, onHoverHub }) {
    const allHubs  = Object.entries(hubAverages);
    if (allHubs.length === 0) return null;

    const visibleHubs = hubFilter === 'late'
        ? allHubs.filter(([, hub]) => hub.avgDelaySec > ON_TIME_SEC)
        : allHubs;

    return (
        <div className="mt-4 pt-3 border-t border-border/40">
            <div className="flex items-center gap-2 mb-2">
                <ButtonsGroup value={hubFilter} onChange={onHubFilterChange}>
                    <ButtonsGroupItem value="all"  text="Hub Averages" />
                    <ButtonsGroupItem value="late" text="Late Only" />
                </ButtonsGroup>
            </div>
            {visibleHubs.length === 0 && (
                <p className="text-xs text-muted-foreground">No late hubs.</p>
            )}
            <div className="flex flex-wrap gap-2">
                {visibleHubs.map(([groupId, hub]) => {
                    const d = hub.avgDelaySec;
                    const isOnTime = d >= -EARLY_SEC && d <= ON_TIME_SEC;
                    const isHovered = hoveredGroupId === groupId;
                    const bg   = isOnTime          ? 'bg-green-500/10'
                               : d < -EARLY_SEC    ? 'bg-blue-400/15'
                               : d <= WARNING_SEC  ? 'bg-orange-400/15'
                               :                     'bg-red-500/15';
                    const text = delayColor(d);
                    const borderCls = isHovered ? 'border-foreground/40' : 'border-border/50';

                    return (
                        <div
                            key={groupId}
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border cursor-default transition-colors ${bg} ${borderCls}`}
                            onMouseEnter={() => onHoverHub(groupId)}
                            onMouseLeave={() => onHoverHub(null)}
                        >
                            <span className="text-foreground/80 font-medium">{hub.name}</span>
                            <span className={`tabular-nums font-semibold ${text}`}>
                                {formatSecondsAsTime(hub.avgDelaySec, true)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Root export ───────────────────────────────────────────────────────────────

const GRID_COLS = 'max-content 1fr 72px 72px 72px';

export function AdherenceHeatmap({ routes, hubAverages = {} }) {
    const [hoveredGroupId, setHoveredGroupId] = React.useState(null);
    const [hubFilter,      setHubFilter]      = React.useState('all');   // 'all' | 'late'

    if (!routes || routes.length === 0) {
        return (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground rounded border bg-muted/20">
                No routes to display.
            </div>
        );
    }

    const hasAnyData = routes.some(r => r.stops.some(s => s.delaySec !== null));

    // Precompute the set of highlighted station IDs for the hovered hub
    const hubStationIds = hoveredGroupId
        ? new Set(hubAverages[hoveredGroupId]?.stationIds ?? [])
        : null;

    return (
        <div>
            {/*
             * Single flat CSS grid — all header cells + route row cells are
             * direct children, so the 'max-content' first column auto-sizes
             * to the widest route badge across all rows.
             */}
            <div
                className="grid items-center"
                style={{ gridTemplateColumns: GRID_COLS, columnGap: 8, rowGap: 4 }}
            >
                {/* ── Column headers ── */}
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5">Route</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5">Stops →</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 text-right">Avg delay</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 text-right">Total</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 text-right">Headway</span>

                {/* ── Route rows (React.Fragment = no DOM wrapper, cells are direct grid items) ── */}
                {routes.map(route => (
                    <React.Fragment key={route.routeId}>
                        {/* Route badge */}
                        <div className="flex items-center" style={{ minHeight: 26 }}>
                            <RouteBadge routeId={route.routeId} size="1.5rem" />
                        </div>

                        {/* Stop cells */}
                        <div className="flex gap-px border-r border-primary" style={{ height: 20 }}>
                            {route.stops.map((stop, i) => {
                                const isDimmed = hubStationIds !== null && !hubStationIds.has(stop.stationId);
                                return (
                                    <Tooltip content={cellTooltip(stop)} key={i} delay={0}>
                                        <div
                                            className="flex-1 border-primary hover:bg-accent border-t border-l border-b"
                                            style={{
                                                ...cellStyle(stop.delaySec),
                                                opacity:    isDimmed ? 0.15 : 1,
                                                transition: 'opacity 0.15s',
                                            }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        </div>

                        <AvgDelay    avgDelaySec={route.avgDelaySec} />
                        <TotalDelay  totalDelaySec={route.totalDelaySec} />
                        <HeadwayCell headway={route.headway} />
                    </React.Fragment>
                ))}
            </div>

            {!hasAnyData && (
                <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
                    Waiting for trains to complete their first stops…
                </p>
            )}

            <HubStrip
                hubAverages={hubAverages}
                hubFilter={hubFilter}
                onHubFilterChange={setHubFilter}
                hoveredGroupId={hoveredGroupId}
                onHoverHub={setHoveredGroupId}
            />
        </div>
    );
}
