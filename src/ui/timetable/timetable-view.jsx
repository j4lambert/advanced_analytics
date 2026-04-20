// TimetableView — system-wide timetable adherence view.
// Rendered inside the analytics panel when view === 'timetable'.
//
// Layout (top → bottom):
//   Route selector (multi-select) · System on-time KPI
//   Adherence heatmap (route × stop, CSS grid)
//   Colour legend

import { useSystemAdherence } from '../../hooks/useSystemAdherence.js';
import { AdherenceHeatmap }   from './adherence-heatmap.jsx';
import { RouteSelector }      from './route-selector.jsx';
import { CONFIG }             from '../../config.js';

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

    return (
        <div className="px-6 py-5 space-y-5">

            {/* ── Top bar: selector + KPI ──────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
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
            </div>

            {/* ── Heatmap ──────────────────────────────────────────────────── */}
            <div className="rounded border border-border bg-muted/10 px-4 py-4">
                <p className="text-xs font-medium text-foreground mb-3">
                    Schedule Adherence by Route &amp; Stop
                </p>
                <AdherenceHeatmap routes={filteredRoutes} hubAverages={hubAverages} />
            </div>

            {/* ── Legend ───────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[10px] text-muted-foreground">
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

        </div>
    );
}
