// TimetableView — system-wide timetable adherence view.
// Rendered inside the analytics panel when view === 'timetable'.
//
// Layout (top → bottom):
//   Route selector (multi-select) · System on-time KPI
//   Route order + hub filter controls
//   Adherence heatmap (route × stop, CSS grid) · Legend · Hub averages

import { useSystemAdherence }    from '../../hooks/useSystemAdherence.js';
import { AdherenceHeatmap }      from './adherence-heatmap.jsx';
import { RouteSelector }         from './route-selector.jsx';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { getTrainsForRoute }     from '../../metrics/accumulator.js';
import { computeHeadwayRegularity } from '../../metrics/timetable-metrics.js';
import { CONFIG }                from '../../config.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

function scoreColor(score) {
    if (score === null) return 'text-muted-foreground';
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-amber-500';
    return 'text-red-500';
}

function scoreLabel(score) {
    if (score === null) return '';
    if (score >= 90) return 'Good';
    if (score >= 70) return 'Fair';
    return 'Poor';
}

export function TimetableView() {
    const snapshot = useSystemAdherence();
    // null = uninitialised (show all); string[] = explicit selection
    const [selectedIds, setSelectedIds] = React.useState(null);
    const [routeOrder,  setRouteOrder]  = React.useState('default');   // 'default' | 'most-delayed'

    const routes = snapshot?.routes ?? [];

    // Initialise to all routes on first data arrival
    React.useEffect(() => {
        if (snapshot && selectedIds === null) {
            setSelectedIds(snapshot.routes.map(r => r.routeId));
        }
    }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

    const effectiveIds   = selectedIds ?? routes.map(r => r.routeId);
    const filteredRoutes = routes.filter(r => effectiveIds.includes(r.routeId));
    const hubAverages    = snapshot?.hubAverages ?? {};
    const score          = snapshot?.systemAdherenceScore ?? null;

    const { EARLY_SEC, ON_TIME_SEC, WARNING_SEC } = CONFIG.ADHERENCE_THRESHOLDS;

    // Apply route ordering
    const orderedRoutes = React.useMemo(() => {
        if (routeOrder === 'most-delayed') {
            return [...filteredRoutes].sort((a, b) => {
                if (a.avgDelaySec === null && b.avgDelaySec === null) return 0;
                if (a.avgDelaySec === null) return 1;
                if (b.avgDelaySec === null) return -1;
                return b.avgDelaySec - a.avgDelaySec;
            });
        }
        return filteredRoutes;
    }, [filteredRoutes, routeOrder]);

    // Enrich routes with headway (shared logic with route-dialog)
    const enrichedRoutes = React.useMemo(() =>
        orderedRoutes.map(r => ({
            ...r,
            headway: computeHeadwayRegularity(getTrainsForRoute(r.routeId)),
        })),
        [orderedRoutes]
    );

    return (
        <div className="px-6 py-5 space-y-5">

            <section className={"flex justify-between items-end py-5"}>
                <h3 class="text-xl font-semibold leading-none tracking-tight">Schedule Adherence by Route &amp; Stop</h3>

                {/* System on-time KPI */}
                <div className="flex items-center gap-2.5 rounded border border-border bg-muted/20 px-4 py-2 shrink-0">
                    <div>
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1">
                            On Time
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-2xl font-bold tabular-nums leading-none ${scoreColor(score)}`}>
                                {score !== null ? score : '—'}
                            </span>
                            {score !== null && (
                                <span className={`text-sm font-semibold ${scoreColor(score)}`}>%</span>
                            )}
                        </div>
                    </div>
                    {score !== null && (
                        <span className={`text-xs font-medium ${scoreColor(score)}`}>
                            {scoreLabel(score)}
                        </span>
                    )}
                </div>
            </section>

            {/* ── Controls bar ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground shrink-0">Show routes:</span>
                    {routes.length > 0 ? (
                        <RouteSelector
                            routes={routes}
                            selectedIds={effectiveIds}
                            onChange={setSelectedIds}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Order:</span>
                    <ButtonsGroup value={routeOrder} onChange={setRouteOrder}>
                        <ButtonsGroupItem value="default"      text="Default" />
                        <ButtonsGroupItem value="most-delayed" text="Most Delayed First" />
                    </ButtonsGroup>
                </div>
            </div>


            {/* ── Heatmap ──────────────────────────────────────────────────── */}
            <div className="py-4">

                {/* ── Legend (immediately after title) ─────────────────────── */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[10px] text-muted-foreground mb-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(96,165,250,0.5)' }} />
                        <span>Early (&gt; {EARLY_SEC}s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-3 rounded-sm border border-border/60" />
                        <span>On time (−{EARLY_SEC}s to +{ON_TIME_SEC}s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(249,115,22,0.45)' }} />
                        <span>Slightly late ({ON_TIME_SEC}–{WARNING_SEC}s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(220,38,38,0.75)' }} />
                        <span>Late (&gt; {WARNING_SEC}s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(156,163,175,0.2)' }} />
                        <span>No data</span>
                    </div>
                </div>

                <AdherenceHeatmap
                    routes={enrichedRoutes}
                    hubAverages={hubAverages}
                />
            </div>

        </div>
    );
}
