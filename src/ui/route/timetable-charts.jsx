// Timetable Analysis Charts
// Delay Profile + Dwell Compliance — two side-by-side vertical bar charts.
// Each stop shows one combined bar. When the route is pendulum, the tooltip
// breaks down Outbound / Return / Combined; otherwise just the single value.

import { CONFIG }                   from '../../config.js';
import { formatSecondsAsTime }      from '../../utils/formatting.js';
import { getRouteStationsInOrder }  from '../../utils/route-utils.js';

const api = window.SubwayBuilderAPI;
const { React, charts } = api.utils;
const h = React.createElement;

// ── Colour helpers ─────────────────────────────────────────────────────────────

const { EARLY_SEC, ON_TIME_SEC, WARNING_SEC } = CONFIG.ADHERENCE_THRESHOLDS;
const { ADHERENCE } = CONFIG.COLORS;

// Bar fill colour — signed value so early bars (negative) get blue.
function delayColor(delaySec) {
    if (delaySec >= -EARLY_SEC && delaySec <= ON_TIME_SEC) return 'var(--color-green-500, #22c55e)';
    if (delaySec < -EARLY_SEC)   return 'var(--color-blue-400, #60a5fa)';
    if (delaySec <= WARNING_SEC) return 'var(--color-orange-500, #f97316)';
    return 'var(--color-red-500, #ef4444)';
}

// Tailwind text colour for tooltip values
function delayTextClass(delaySec) {
    if (delaySec >= -EARLY_SEC && delaySec <= ON_TIME_SEC) return ADHERENCE.ON_TIME;
    if (delaySec < -EARLY_SEC)   return ADHERENCE.EARLY;
    if (delaySec <= WARNING_SEC) return ADHERENCE.SLIGHTLY_LATE;
    return ADHERENCE.LATE;
}

// Custom bar shape — colored individually by value
function makeColoredBar(dataKey) {
    return function ColoredBar(props) {
        const { x, y, width, height } = props;
        const val = props[dataKey] ?? props.value;
        if (!width || !height || val === undefined || val === null) return null;
        const color = delayColor(val);  // signed — direction matters for colour
        const absW  = Math.abs(width);
        const absH  = Math.abs(height);
        const xLeft = width  < 0 ? x + width  : x;
        const yTop  = height < 0 ? y + height : y;
        return h('rect', { x: xLeft, y: yTop, width: absW, height: absH, fill: color, fillOpacity: 0.8, rx: 2 });
    };
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function tooltipRow(label, delaySec) {
    return h('tr', { key: label },
        h('td', { className: 'text-muted-foreground pr-3 whitespace-nowrap' }, label),
        h('td', { className: `tabular-nums text-right ${delayTextClass(delaySec)}` },
            formatSecondsAsTime(delaySec, true)
        ),
    );
}

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;

    // Full data row is in payload[0].payload (Recharts always passes the full row)
    const row     = payload[0]?.payload ?? {};
    const isDelay = payload[0]?.dataKey?.includes('Delay');
    const fwdVal  = isDelay ? row.fwdDelaySec  : row.fwdDwellDiff;
    const revVal  = isDelay ? row.revDelaySec  : row.revDwellDiff;
    const avgVal  = isDelay ? row.avgDelaySec  : row.avgDwellDiff;

    const hasBothDirs = fwdVal != null && revVal != null;

    return h('div', { className: 'rounded border bg-popover px-3 py-2 text-xs shadow-md' },
        h('div', { className: 'font-semibold mb-1.5' }, label),
        hasBothDirs
            ? h('table', null,
                h('tbody', null,
                    tooltipRow('→ Outbound', fwdVal),
                    tooltipRow('← Return',   revVal),
                    tooltipRow('Combined',   avgVal ?? 0),
                )
              )
            : h('span', { className: `tabular-nums ${delayTextClass(avgVal ?? 0)}` },
                formatSecondsAsTime(avgVal ?? 0, true)
              )
    );
}

// ── Chart ──────────────────────────────────────────────────────────────────────

function TimetableBarChart({ data, dataKey, hideYAxis = false, yAxisWidth }) {
    const chartHeight = Math.max(data.length * 20, 80);
    const computedYAxisWidth = yAxisWidth ?? Math.min(
        Math.max(...data.map(d => d.name.length)) * 7,
        160
    );

    return h('div', { style: { width: '100%', height: `${chartHeight}px` } },
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            h(charts.BarChart, {
                layout: 'vertical',
                data,
                margin: { top: 4, right: 16, left: 8, bottom: 4 },
                barCategoryGap: '20%',
            },
                h(charts.CartesianGrid, {
                    key:             'grid',
                    horizontal:      false,
                    strokeDasharray: '3 3',
                    stroke:          '#374151',
                    opacity:         0.3,
                }),
                h(charts.YAxis, {
                    key:      'yaxis',
                    type:     'category',
                    dataKey:  'name',
                    width:    hideYAxis ? 0 : computedYAxisWidth,
                    stroke:   '#9ca3af',
                    fontSize: 11,
                    tickLine: false,
                    axisLine: false,
                    hide:     hideYAxis,
                    interval: 0,
                }),
                h(charts.XAxis, {
                    key:           'xaxis',
                    type:          'number',
                    stroke:        '#9ca3af',
                    fontSize:      11,
                    tickLine:      false,
                    axisLine:      false,
                    tickFormatter: v => `${Math.round(v)}s`,
                }),
                h(charts.ReferenceLine, {
                    key:           'zero',
                    x:             0,
                    stroke:        '#6b7280',
                    strokeOpacity: 0.4,
                }),
                h(charts.Tooltip, {
                    key:     'tooltip',
                    content: (props) => h(ChartTooltip, props),
                    cursor:  { fill: 'currentColor', opacity: 0.04 },
                }),
                h(charts.Bar, {
                    key:               dataKey,
                    dataKey,
                    barSize:           2,
                    shape:             makeColoredBar(dataKey),
                    animationDuration: 400,
                })
            )
        )
    );
}

// ── Root export ────────────────────────────────────────────────────────────────

export function TimetableCharts({ routeId, accum }) {
    const chartData = React.useMemo(() => {
        if (!accum) return [];
        const stations = getRouteStationsInOrder(routeId, api);
        const rows = [];
        for (const station of stations) {
            const raw        = accum[station.stNodeId];
            const fwd        = raw?.fwd, rev = raw?.rev;
            const fwdCount   = fwd?.count ?? 0;
            const revCount   = rev?.count ?? 0;
            const totalCount = fwdCount + revCount;
            if (totalCount === 0) continue;

            rows.push({
                name:         station.name,
                fwdDelaySec:  fwdCount > 0 ? +(fwd.sumDelaySec / fwdCount).toFixed(1) : null,
                revDelaySec:  revCount > 0 ? +(rev.sumDelaySec / revCount).toFixed(1) : null,
                avgDelaySec:  +(((fwd?.sumDelaySec ?? 0) + (rev?.sumDelaySec ?? 0)) / totalCount).toFixed(1),
                fwdDwellDiff: fwdCount > 0
                    ? +((fwd.sumDwellActual - fwd.sumDwellExpected) / fwdCount).toFixed(1) : null,
                revDwellDiff: revCount > 0
                    ? +((rev.sumDwellActual - rev.sumDwellExpected) / revCount).toFixed(1) : null,
                avgDwellDiff: +(((fwd?.sumDwellActual ?? 0) - (fwd?.sumDwellExpected ?? 0)
                               + (rev?.sumDwellActual ?? 0) - (rev?.sumDwellExpected ?? 0)) / totalCount).toFixed(1),
                count: totalCount,
            });
        }
        return rows;
    }, [routeId, accum]);

    if (chartData.length === 0) {
        return h('div', { className: 'flex items-center justify-center h-24 text-sm text-muted-foreground rounded border bg-muted/20' },
            'Not enough data yet — waiting for trains to complete their first stop.'
        );
    }

    const yAxisWidth = Math.min(
        Math.max(...chartData.map(d => d.name.length)) * 7,
        160
    );

    const chartDefs = [
        { key: 'delay', dataKey: 'avgDelaySec',  label: 'Delay Profile',    desc: 'Avg arrival delay per stop vs adjusted schedule',      hideYAxis: false },
        { key: 'dwell', dataKey: 'avgDwellDiff',  label: 'Dwell Compliance', desc: 'Avg difference between actual and expected dwell time', hideYAxis: true  },
    ];

    return h('div', { className: 'flex gap-6 w-full' },
        ...chartDefs.map(({ key, dataKey, label, desc, hideYAxis }) =>
            h('div', { key, className: 'flex-1 min-w-0' },
                h('div', { className: 'mb-2' },
                    h('p', { className: 'text-xs font-medium text-foreground' }, label),
                    h('p', { className: 'text-xs text-muted-foreground' }, desc),
                ),
                h(TimetableBarChart, { data: chartData, dataKey, hideYAxis, yAxisWidth })
            )
        )
    );
}
