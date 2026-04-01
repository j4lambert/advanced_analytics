// Timetable Analysis Charts
// Delay Profile + Dwell Compliance — two side-by-side vertical bar charts.
// Renders per-stop averages accumulated by the accumulator across completed laps today.

import { CONFIG }                   from '../../config.js';
import { formatSecondsAsTime }      from '../../utils/formatting.js';
import { getRouteStationsInOrder }  from '../../utils/route-utils.js';

const api = window.SubwayBuilderAPI;
const { React, charts } = api.utils;
const h = React.createElement;

// ── Colour helpers ─────────────────────────────────────────────────────────────

function delayColor(absSec) {
    const { GOOD, WARNING } = CONFIG.SCHEDULE_DRIFT_THRESHOLDS;
    if (absSec < GOOD)    return 'var(--color-green-500, #22c55e)';
    if (absSec < WARNING) return 'var(--color-yellow-500, #eab308)';
    return 'var(--color-red-500, #ef4444)';
}

// Custom bar shape — colored individually based on the bar's value
function makeColoredBar(getValue) {
    return function ColoredBar(props) {
        const { x, y, width, height } = props;
        if (!width || !height) return null;
        const val   = getValue(props);
        const color = delayColor(Math.abs(val));
        const absH  = Math.abs(height);
        const yTop  = height < 0 ? y + height : y;
        return h('rect', { x, y: yTop, width, height: absH, fill: color, fillOpacity: 0.8, rx: 2 });
    };
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, mode }) {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value ?? 0;
    return h('div', { className: 'rounded border bg-popover px-3 py-2 text-xs shadow-md' },
        h('div', { className: 'font-semibold mb-1' }, label),
        h('div', { className: 'tabular-nums' },
            mode === 'delay'
                ? `Avg delay: ${formatSecondsAsTime(val, true)}`
                : `Dwell diff: ${formatSecondsAsTime(val, true)}`
        )
    );
}

// ── Chart ──────────────────────────────────────────────────────────────────────

function TimetableBarChart({ data, dataKey, mode, hideYAxis = false, yAxisWidth }) {
    const chartHeight = Math.max(data.length * 32, 200);
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
                    content: (props) => h(ChartTooltip, { ...props, mode }),
                }),
                h(charts.Bar, {
                    key:               dataKey,
                    dataKey,
                    shape:             makeColoredBar(p => p[dataKey] ?? p.value ?? 0),
                    animationDuration: 400,
                })
            )
        )
    );
}

// ── Root export ────────────────────────────────────────────────────────────────

export function TimetableCharts({ routeId, accum }) {
    // Map accum (keyed by stNodeId) → ordered array with station names
    const chartData = React.useMemo(() => {
        if (!accum) return [];
        const stations = getRouteStationsInOrder(routeId, api);
        const rows = [];
        for (const station of stations) {
            const bucket = accum[station.stNodeId];
            if (!bucket || bucket.count === 0) continue;
            rows.push({
                name:         station.name,
                avgDelaySec:  +(bucket.sumDelaySec    / bucket.count).toFixed(1),
                avgDwellDiff: +((bucket.sumDwellActual - bucket.sumDwellExpected) / bucket.count).toFixed(1),
                count:        bucket.count,
            });
        }
        return rows;
    }, [routeId, accum]);

    if (chartData.length === 0) {
        return h('div', { className: 'flex items-center justify-center h-24 text-sm text-muted-foreground rounded border bg-muted/20' },
            'Not enough data yet — waiting for trains to complete their first stop.'
        );
    }

    // Compute shared YAxis width so both charts align horizontally
    const yAxisWidth = Math.min(
        Math.max(...chartData.map(d => d.name.length)) * 7,
        160
    );

    const chartDefs = [
        { key: 'delay', dataKey: 'avgDelaySec',  mode: 'delay', label: 'Delay Profile',    desc: 'Avg arrival delay per stop vs adjusted schedule',          hideYAxis: false },
        { key: 'dwell', dataKey: 'avgDwellDiff',  mode: 'dwell', label: 'Dwell Compliance', desc: 'Avg difference between actual and expected dwell time',     hideYAxis: true  },
    ];

    return h('div', { className: 'flex gap-6 w-full' },
        ...chartDefs.map(({ key, dataKey, mode, label, desc, hideYAxis }) =>
            h('div', { key, className: 'flex-1 min-w-0' },
                h('div', { className: 'mb-2' },
                    h('p', { className: 'text-xs font-medium text-foreground' }, label),
                    h('p', { className: 'text-xs text-muted-foreground' }, desc),
                ),
                h(TimetableBarChart, { data: chartData, dataKey, mode, hideYAxis, yAxisWidth })
            )
        )
    );
}
