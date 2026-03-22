// System Stats — top-of-dashboard network overview
//
// Shows two headline metrics + a row of quick-stat chips.
//
// ── SYSTEM LOAD FACTOR ───────────────────────────────────────────────────────
//   Ridership-weighted average of per-route load factors.
//   Each route's load factor = peak segment load ÷ train capacity, so this
//   answers "across the whole network, how full are trains at their busiest
//   point on each route, weighted by how many people ride each route?"
//   Zones: <40% under-served · 40–55% light · 55–80% healthy · 80–90% heavy
//          >90% overcrowded
//
// ── NETWORK HEALTH SCORE ─────────────────────────────────────────────────────
//   Ridership-weighted average of a per-route "health" function that rewards
//   load factor in the 55–80% sweet spot and penalises both waste and crowding:
//
//     score(u) = 0               u ≤ 40%
//              = (u-40)/15 × 0.5  40 < u ≤ 55%   (ramp up)
//              = 1.0              55 < u ≤ 80%   (perfect)
//              = 1 - (u-80)/10×0.3  80 < u ≤ 90% (mild crowding)
//              = 0.7 - (u-90)/30×0.7 90 < u ≤ 120%(severe crowding)
//              = 0               u > 120%
//
//   Network Health = Σ(ridership_i × score_i) / Σridership_i  × 100   (0–100)
//
//   Displayed as a semi-circle gauge + a word rating (Poor → Excellent).

import { isZustandAvailable, getTransferGroups } from '../../core/api-support.js';
import { formatCurrencyCompact } from '../../utils/formatting.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Health score helpers ──────────────────────────────────────────────────────

function routeHealthScore(utilization) {
    const u = utilization ?? 0;
    if (u <= 40)  return 0;
    if (u <= 55)  return ((u - 40) / 15) * 0.5;
    if (u <= 80)  return 1.0;
    if (u <= 90)  return 1.0 - ((u - 80) / 10) * 0.3;
    if (u <= 120) return 0.7 - ((u - 90) / 30) * 0.7;
    return 0;
}

function healthColor(score) {
    if (score < 40) return '#ef4444';
    if (score < 60) return '#f59e0b';
    if (score < 75) return '#84cc16';
    return '#22c55e';
}

function healthLabel(score) {
    if (score < 40) return 'Poor';
    if (score < 60) return 'Fair';
    if (score < 75) return 'Good';
    if (score < 90) return 'Very Good';
    return 'Excellent';
}

// ── Load factor helpers ───────────────────────────────────────────────────────

function loadColor(pct) {
    if (pct < 40) return '#ef4444';
    if (pct < 55) return '#f59e0b';
    if (pct < 80) return '#22c55e';
    if (pct < 90) return '#f59e0b';
    return '#ef4444';
}

function loadLabel(pct) {
    if (pct < 40) return 'Under-served';
    if (pct < 55) return 'Light';
    if (pct < 80) return 'Healthy';
    if (pct < 90) return 'Heavy';
    return 'Overcrowded';
}

// ── Helper ───────────────────────────────────────────────────────

const getCityName = (cityCode) => {
    if (!cityCode) return 'Unknown';
    const cities = api.utils.getCities();
    const city   = cities.find(c => c.code === cityCode);
    return city ? city.name : cityCode;
};

// ── Semi-circle gauge ─────────────────────────────────────────────────────────
// Drawn inside a 120 × 72 viewBox.
// The arc starts at the left (10, 62), sweeps counter-clockwise upward,
// and ends at the right (110, 62) when score = 100.

function GaugeArc({ score }) {
    const cx = 60, cy = 62, r = 48, sw = 9;
    const s  = Math.max(0, Math.min(1, score / 100));
    const c  = healthColor(score);

    // Background: full semi-circle  M left A r r 0 1 0 right
    const bg = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy}`;

    // Fill arc for score s (clockwise from left, through top, to score-angle)
    let fill = null;
    if (s > 0.001) {
        const angle = Math.PI * (1 - s);
        const ex    = +(cx + r * Math.cos(angle)).toFixed(2);
        const ey    = +(cy - r * Math.sin(angle)).toFixed(2);
        fill = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
    }

    return (
        <svg viewBox="0 0 120 72" style={{ width: '100%', maxHeight: 72 }}>
            {/* Zone ticks at 40 / 55 / 80 / 90 */}
            {[40, 55, 80, 90].map(t => {
                const a = Math.PI * (1 - t / 100);
                const x1 = cx + (r - sw / 2 - 2) * Math.cos(a);
                const y1 = cy - (r - sw / 2 - 2) * Math.sin(a);
                const x2 = cx + (r + sw / 2 + 2) * Math.cos(a);
                const y2 = cy - (r + sw / 2 + 2) * Math.sin(a);
                return (
                    <line
                        key={t}
                        x1={x1.toFixed(1)} y1={y1.toFixed(1)}
                        x2={x2.toFixed(1)} y2={y2.toFixed(1)}
                        stroke="var(--background, #fff)"
                        strokeWidth="1.5"
                        opacity="0.7"
                    />
                );
            })}

            {/* Background arc */}
            {/*<path d={bg} fill="none" stroke="#94a3b8" strokeWidth={sw}*/}
            {/*      strokeLinecap="round" opacity="0.25" />*/}

            {/* Filled arc */}
            {fill && (
                <path d={fill} fill="none" stroke={c} strokeWidth={sw}
                      strokeLinecap="round" />
            )}

            {/* Score */}
            <text x={cx} y={cy - 6}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="20" fontWeight="700"
                  fill={s > 0.001 ? c : '#94a3b8'}
                  style={{ fontFamily: 'inherit' }}
            >
                {Math.round(score)}
            </text>
            <text x={cx} y={cy + 9}
                  textAnchor="middle"
                  fontSize="7.5" fill="#94a3b8"
                  style={{ fontFamily: 'inherit' }}
            >
                / 100
            </text>
        </svg>
    );
}

// ── Load factor bar ───────────────────────────────────────────────────────────

// Zone segments as percentage-of-100 widths
const ZONE_SEGMENTS = [
    { width: 40, color: '#ef4444' },  // 0 – 40%
    { width: 15, color: '#f59e0b' },  // 40 – 55%
    { width: 25, color: '#22c55e' },  // 55 – 80%
    { width: 10, color: '#f59e0b' },  // 80 – 90%
    { width: 10, color: '#ef4444' },  // 90 – 100%
];

function LoadFactorBar({ pct }) {
    const color    = loadColor(pct);
    const label    = loadLabel(pct);
    const fillPct  = Math.min(pct, 100);          // cap visual fill at 100%
    const overCap  = pct > 100;

    return (
        <div className="space-y-2">
            {/* Headline number */}
            <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums leading-none"
                      style={{ color }}>
                    {pct.toFixed(1)}
                </span>
                <span className="text-base font-semibold" style={{ color }}>%</span>
                <span className="text-xs text-muted-foreground ml-1">{label}</span>
            </div>

            {/* Zoned progress bar */}
            <div className="relative h-3 rounded-full overflow-hidden">
                {/* Zone backgrounds */}
                <div className="absolute inset-0 flex">
                    {ZONE_SEGMENTS.map((z, i) => (
                        <div key={i} className="h-full"
                             style={{ width: `${z.width}%`, background: z.color, opacity: 0.28 }} />
                    ))}
                </div>
                {/* Fill */}
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                     style={{ width: `${fillPct}%`, background: color, opacity: 0.85 }} />
                {/* Over-capacity hatch */}
                {overCap && (
                    <div className="absolute inset-y-0 right-0 w-5"
                         style={{
                             background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 3px, transparent 3px, transparent 6px)',
                         }} />
                )}
                {/* Zone dividers */}
                {[40, 55, 80, 90].map(t => (
                    <div key={t} className="absolute inset-y-0 w-px bg-background/50"
                         style={{ left: `${t}%` }} />
                ))}
            </div>

            {/* Zone labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground select-none">
                <span>0%</span>
                <span>Healthy zone: 55–80%</span>
                <span>100%</span>
            </div>
        </div>
    );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ Icon, label, value }) {
    return (
        <div className="flex gap-2 px-3 py-2 rounded-lg border border-border bg-muted/10">
            {Icon && <Icon size={13} className="shrink-0" />}
            <div className="leading-none">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                    {label}
                </div>
                <div className="text-sm font-semibold tabular-nums">{value}</div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SystemStats({ liveRouteData }) {
    const stats = React.useMemo(() => {
        const routes = (liveRouteData ?? []).filter(r => !r.deleted);
        if (!routes.length) return null;

        const totalRidership = routes.reduce((s, r) => s + (r.ridership  ?? 0), 0);
        const totalCapacity  = routes.reduce((s, r) => s + (r.capacity   ?? 0), 0);
        const totalTrains    = routes.reduce((s, r) => s + (r.totalTrains ?? 0), 0);
        const totalRevenue   = routes.reduce((s, r) => s + (r.dailyRevenue ?? 0), 0);

        // Ridership-weighted average of per-route load factors (each already 0–100)
        const loadFactor = totalRidership > 0
            ? routes.reduce((s, r) => s + (r.ridership ?? 0) * (r.loadFactor ?? 0), 0) / totalRidership
            : 0;

        const healthScore = totalRidership > 0
            ? routes.reduce((s, r) =>
                s + (r.ridership ?? 0) * routeHealthScore(r.loadFactor ?? 0)
              , 0) / totalRidership * 100
            : 0;

        let hubCount = 0;
        try {
            hubCount = isZustandAvailable()
                ? getTransferGroups().length
                : api.gameState.getStations().filter(s => (s.routeIds?.length ?? 0) >= 2).length;
        } catch { /* non-fatal */ }

        return {
            routeCount: routes.length,
            totalTrains,
            hubCount,
            totalRidership,
            totalRevenue,
            loadFactor,
            healthScore,
        };
    }, [liveRouteData]);

    if (!stats) return null;

    return (
        <div className="space-y-3 py-6">
            <div className="grid grid-cols-2 gap-4">
                {/* ── Stat chips ─────────────────────────────────────────────── */}
                <div>
                    <div className={'text-lg'}>
                        {getCityName(api.utils.getCityCode())}
                    </div>
                    <div className={'text-xs text-muted-foregound'}>
                        Day {api.gameState.getCurrentDay() + 1}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatChip Icon={icons.Route}     label="Routes"    value={stats.routeCount} />
                    <StatChip Icon={icons.TramFront} label="Trains"    value={stats.totalTrains.toLocaleString()} />
                    <StatChip Icon={icons.Component} label="Hubs"      value={stats.hubCount} />
                    <StatChip Icon={icons.Users}     label="Ridership" value={`${Math.round(stats.totalRidership).toLocaleString()} / day`} />
                    <StatChip Icon={icons.TrendingUp} label="Revenue"  value={`${formatCurrencyCompact(stats.totalRevenue)} / day`} />
                </div>
            </div>

            {/* ── Metric cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">

                {/* Load Factor */}
                <div className="rounded-lg border border-border bg-muted/10 px-4 py-3 space-y-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider">
                            System Load Factor
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Ridership-weighted avg. peak segment load
                        </p>
                    </div>
                    <LoadFactorBar pct={stats.loadFactor} />
                </div>

                {/* Network Health Score */}
                <div className="rounded-lg border border-border bg-muted/10 px-4 py-3">
                    <div className="mb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider">
                            Network Health Score
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Ridership-weighted load factor quality (0–100)
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-28 shrink-0">
                            <GaugeArc score={stats.healthScore} />
                        </div>
                        <div>
                            <p className="text-xl font-bold leading-none"
                               style={{ color: healthColor(stats.healthScore) }}>
                                {healthLabel(stats.healthScore)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                Routes with load factor 55–80% score highest.<br/>
                                Under-served or overcrowded routes lower the score.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
