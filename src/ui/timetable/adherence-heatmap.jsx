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

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const { ON_TIME_SEC, WARNING_SEC } = CONFIG.ADHERENCE_THRESHOLDS;

// ── Cell colour ───────────────────────────────────────────────────────────────

function cellStyle(delaySec) {
    if (delaySec === null) return { backgroundColor: 'rgba(156,163,175,0.2)' };
    const abs = Math.abs(delaySec);
    if (abs <= ON_TIME_SEC) return {};
    const early = delaySec < 0;
    if (abs <= WARNING_SEC) {
        return { backgroundColor: early ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)' };
    }
    return { backgroundColor: early ? 'rgba(37,99,235,0.75)' : 'rgba(220,38,38,0.75)' };
}

function cellTitle(stop) {
    if (stop.delaySec === null) return `${stop.stationName} — no data`;
    const dir = stop.delaySec < 0 ? 'early' : stop.delaySec > 0 ? 'late' : 'on time';
    return `${stop.stationName}: ${formatSecondsAsTime(stop.delaySec, true)} (${dir})`;
}

// ── Avg delay label ───────────────────────────────────────────────────────────

function AvgDelay({ avgDelaySec }) {
    if (avgDelaySec === null) {
        return <div className="text-[10px] text-muted-foreground text-right">—</div>;
    }
    const abs   = Math.abs(avgDelaySec);
    const early = avgDelaySec < 0;
    const color = abs <= ON_TIME_SEC
        ? 'text-green-500'
        : abs <= WARNING_SEC
        ? (early ? 'text-blue-400' : 'text-orange-400')
        : (early ? 'text-blue-600' : 'text-red-500');

    return (
        <div className={`text-[10px] tabular-nums font-medium text-right ${color}`}>
            {formatSecondsAsTime(avgDelaySec, true)}
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
                    const abs   = Math.abs(hub.avgDelaySec);
                    const early = hub.avgDelaySec < 0;
                    const bg = abs <= ON_TIME_SEC
                        ? 'bg-green-500/10'
                        : abs <= WARNING_SEC
                        ? (early ? 'bg-blue-500/10' : 'bg-orange-400/10')
                        : (early ? 'bg-blue-600/15' : 'bg-red-500/15');
                    const text = abs <= ON_TIME_SEC
                        ? 'text-green-600'
                        : abs <= WARNING_SEC
                        ? (early ? 'text-blue-500' : 'text-orange-500')
                        : (early ? 'text-blue-600' : 'text-red-500');

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
                style={{ gridTemplateColumns: '140px 1fr 72px' }}
            >
                <span>Route</span>
                <span>Stops →</span>
                <span className="text-right">Avg delay</span>
            </div>

            {/* Route rows */}
            <div className="space-y-1">
                {routes.map(route => (
                    <div
                        key={route.routeId}
                        className="grid items-center gap-x-2"
                        style={{ gridTemplateColumns: '140px 1fr 72px', minHeight: 26 }}
                    >
                        {/* Route label */}
                        <div className="truncate text-xs pr-2 text-foreground/80" title={route.routeName}>
                            {route.routeName}
                        </div>

                        {/* Stop cells */}
                        <div className="flex gap-px border-r border-primary" style={{ height: 20 }}>
                            {route.stops.map((stop, i) => (
                                <Tooltip content={cellTitle(stop)} key={i} delay={0}>
                                    <div
                                        className="flex-1 border-primary hover:bg-accent border-t border-l border-b"
                                        style={cellStyle(stop.delaySec)}
                                    />
                                </Tooltip>
                            ))}
                        </div>

                        {/* Avg delay */}
                        <AvgDelay avgDelaySec={route.avgDelaySec} />
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
