// AdherenceHeatmap — CSS grid layout showing per-route, per-stop delay colours.
//
// Layout per row:
//   [route label 140px] [stop cells 1fr] [avg delay text 72px]
//
// Stop cells: equal-width flex row within each route row. Colour encodes direction
// and magnitude — blue (early) ↔ white (on time) ↔ red (late). No attempt is made
// to align stops across routes because routes have different stop counts.
//
// Hub strip: separate wrapping row of chips below the grid (not column-aligned).

import { CONFIG }              from '../../config.js';
import { formatSecondsAsTime } from '../../utils/formatting.js';
import { Tooltip }             from "../../components/tooltip";
import { RouteBadge }          from '../../components/route-badge.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const { EARLY_SEC, ON_TIME_SEC, WARNING_SEC } = CONFIG.ADHERENCE_THRESHOLDS;
const { ADHERENCE } = CONFIG.COLORS;

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

// ── Hub strip ─────────────────────────────────────────────────────────────────

function HubStrip({ hubAverages }) {
    const hubs = Object.entries(hubAverages);
    if (hubs.length === 0) return null;

    return (
        <div className="mt-4 pt-3 border-t border-border/40">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Hub averages
            </div>
            <div className="flex flex-wrap gap-2">
                {hubs.map(([groupId, hub]) => {
                    const d = hub.avgDelaySec;
                    const isOnTime = d >= -EARLY_SEC && d <= ON_TIME_SEC;
                    const bg   = isOnTime          ? 'bg-green-500/10'
                               : d < -EARLY_SEC    ? 'bg-blue-400/15'
                               : d <= WARNING_SEC  ? 'bg-orange-400/15'
                               :                     'bg-red-500/15';
                    const text = delayColor(d);

                    return (
                        <div
                            key={groupId}
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border border-border/50 ${bg}`}
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

export function AdherenceHeatmap({ routes, hubAverages = {} }) {
    if (!routes || routes.length === 0) {
        return (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground rounded border bg-muted/20">
                No routes to display.
            </div>
        );
    }

    const hasAnyData = routes.some(r => r.stops.some(s => s.delaySec !== null));

    return (
        <div>
            {/* Column header */}
            <div
                className="grid text-[9px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5"
                style={{ gridTemplateColumns: '140px 1fr 72px 72px' }}
            >
                <span>Route</span>
                <span>Stops →</span>
                <span className="text-right">Avg delay</span>
                <span className="text-right">Total delay</span>
            </div>

            {/* Route rows */}
            <div className="space-y-1">
                {routes.map(route => (
                    <div
                        key={route.routeId}
                        className="grid items-center gap-x-2"
                        style={{ gridTemplateColumns: '140px 1fr 72px 72px', minHeight: 26 }}
                    >
                        {/* Route badge */}
                        <div className="flex items-center">
                            <RouteBadge routeId={route.routeId} size="1.5rem" />
                        </div>

                        {/* Stop cells */}
                        <div className="flex gap-px border-r border-primary" style={{ height: 20 }}>
                            {route.stops.map((stop, i) => (
                                <Tooltip content={cellTooltip(stop)} key={i} delay={0}>
                                    <div
                                        className="flex-1 border-primary hover:bg-accent border-t border-l border-b"
                                        style={cellStyle(stop.delaySec)}
                                    />
                                </Tooltip>
                            ))}
                        </div>

                        {/* Avg delay */}
                        <AvgDelay avgDelaySec={route.avgDelaySec} />

                        {/* Total delay */}
                        <TotalDelay totalDelaySec={route.totalDelaySec} />
                    </div>
                ))}
            </div>

            {!hasAnyData && (
                <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
                    Waiting for trains to complete their first stops…
                </p>
            )}

            <HubStrip hubAverages={hubAverages} />
        </div>
    );
}
