// Analytics Chart Component
// Displays time-series charts for route metrics

import { CONFIG } from '../config.js';
import { getAvailableDays } from '../utils/formatting.js';
import { ButtonsGroup, ButtonsGroupItem } from './buttons-group.jsx';
import { Dropdown } from './dropdown.jsx';
import { DropdownItem } from './dropdown-item.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// Available metrics for charting
const CHART_METRICS = [
    { key: 'ridership', label: 'Ridership', color: '#3b82f6' },
    { key: 'capacity', label: 'Capacity', color: '#8b5cf6' },
    { key: 'utilization', label: 'Utilization %', color: '#22c55e' },
    { key: 'dailyCost', label: 'Daily Cost', color: '#ef4444' },
    { key: 'dailyRevenue', label: 'Daily Revenue', color: '#10b981' },
    { key: 'dailyProfit', label: 'Daily Profit', color: '#06b6d4' },
];

// Timeframe options (in days)
const TIMEFRAMES = [
    { key: '7', label: '7 Days' },
    { key: '14', label: '14 Days' },
    { key: '30', label: '30 Days' },
    { key: 'all', label: 'All Time' },
];

export function AnalyticsChart({ historicalData }) {
    const [chartType, setChartType] = React.useState('line');
    const [selectedRoutes, setSelectedRoutes] = React.useState([]);
    const [selectedMetric, setSelectedMetric] = React.useState('utilization');
    const [timeframe, setTimeframe] = React.useState('7');
    
    // Get available routes from current game state
    const routes = api.gameState.getRoutes();
    
    // Get available days
    const allDays = React.useMemo(() => {
        return getAvailableDays(historicalData);
    }, [historicalData]);
    
    // Calculate days to show based on timeframe
    const daysToShow = React.useMemo(() => {
        if (timeframe === 'all') return allDays;
        const limit = parseInt(timeframe);
        return allDays.slice(0, limit);
    }, [allDays, timeframe]);
    
    // Transform data for chart
    const chartData = React.useMemo(() => {
        if (selectedRoutes.length === 0 || daysToShow.length === 0) {
            return [];
        }
        
        // Build array of data points, one per day
        const data = daysToShow.map(day => {
            const dayData = historicalData.days[day];
            if (!dayData) return null;
            
            const point = { day };
            
            // Add metric value for each selected route
            selectedRoutes.forEach(routeId => {
                const routeData = dayData.routes.find(r => r.id === routeId);
                if (routeData) {
                    point[routeId] = routeData[selectedMetric] || 0;
                }
            });
            
            return point;
        }).filter(Boolean).reverse(); // Reverse to show oldest to newest
        
        return data;
    }, [selectedRoutes, selectedMetric, daysToShow, historicalData]);
    
    // Get selected metric config
    const metricConfig = CHART_METRICS.find(m => m.key === selectedMetric);
    
    // Auto-select top 3 routes by ridership on first render
    React.useEffect(() => {
        if (selectedRoutes.length === 0 && routes.length > 0 && allDays.length > 0) {
            // Get most recent day data
            const recentDay = allDays[0];
            const recentData = historicalData.days[recentDay];
            
            if (recentData && recentData.routes) {
                // Sort by ridership and take top 3
                const topRoutes = [...recentData.routes]
                    .sort((a, b) => b.ridership - a.ridership)
                    .slice(0, 3)
                    .map(r => r.id);
                
                setSelectedRoutes(topRoutes);
            }
        }
    }, [routes, allDays, historicalData, selectedRoutes.length]);
    
    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between gap-4">
                {/* Left: Chart type */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Chart:</span>
                    <ButtonsGroup value={chartType} onChange={setChartType}>
                        <ButtonsGroupItem value="line" text="Line" />
                        <ButtonsGroupItem value="bar" text="Bar" />
                    </ButtonsGroup>
                </div>
                
                {/* Middle: Route & Metric selection */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Routes:</span>
                    <Dropdown
                        togglerIcon={icons.Route}
                        togglerText={selectedRoutes.length > 0 ? `${selectedRoutes.length} selected` : 'Select routes'}
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[200px] max-h-[300px] overflow-y-auto"
                        multiselect={true}
                        value={selectedRoutes}
                        onChange={setSelectedRoutes}
                    >
                        {routes.map(route => (
                            <DropdownItem
                                key={route.id}
                                value={route.id}
                                text={route.name || route.bullet}
                            />
                        ))}
                    </Dropdown>
                    
                    <span className="text-xs font-medium">Metric:</span>
                    <Dropdown
                        togglerIcon={icons.LineChart}
                        togglerText={metricConfig?.label || 'Select metric'}
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[180px]"
                        multiselect={false}
                        value={selectedMetric}
                        onChange={setSelectedMetric}
                    >
                        {CHART_METRICS.map(metric => (
                            <DropdownItem
                                key={metric.key}
                                value={metric.key}
                                text={metric.label}
                            />
                        ))}
                    </Dropdown>
                </div>
                
                {/* Right: Timeframe */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Period:</span>
                    <ButtonsGroup value={timeframe} onChange={setTimeframe}>
                        {TIMEFRAMES.map(tf => (
                            <ButtonsGroupItem
                                key={tf.key}
                                value={tf.key}
                                text={tf.label}
                            />
                        ))}
                    </ButtonsGroup>
                </div>
            </div>
            
            {/* Chart */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <icons.LineChart size={48} className="text-muted-foreground mb-4" />
                        <div className="text-sm text-muted-foreground">
                            {selectedRoutes.length === 0 ? (
                                <p>Select routes to display chart</p>
                            ) : daysToShow.length === 0 ? (
                                <p>No historical data available</p>
                            ) : (
                                <p>No data available for selected timeframe</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <ChartDisplay
                        data={chartData}
                        routes={routes}
                        selectedRoutes={selectedRoutes}
                        metricKey={selectedMetric}
                        metricLabel={metricConfig?.label}
                        chartType={chartType}
                    />
                )}
            </div>
        </div>
    );
}

// Chart display component (separated for clarity)
function ChartDisplay({ data, routes, selectedRoutes, metricKey, metricLabel, chartType }) {
    const h = React.createElement;
    
    // Get route colors
    const getRouteColor = (routeId) => {
        const route = routes.find(r => r.id === routeId);
        return route?.color || '#888888';
    };
    
    // Format Y-axis values based on metric
    const formatYAxis = (value) => {
        if (metricKey === 'dailyCost' || metricKey === 'dailyRevenue' || metricKey === 'dailyProfit') {
            if (value >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
            }
            if (value >= 1000) {
                return `$${(value / 1000).toFixed(0)}k`;
            }
            return `$${value}`;
        }
        
        if (metricKey === 'utilization') {
            return `${value}%`;
        }
        
        if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}k`;
        }
        
        return value.toLocaleString();
    };
    
    // Format tooltip values
    const formatTooltipValue = (value) => {
        if (metricKey === 'dailyCost' || metricKey === 'dailyRevenue' || metricKey === 'dailyProfit') {
            return `$${value.toLocaleString()}`;
        }
        
        if (metricKey === 'utilization') {
            return `${value}%`;
        }
        
        return value.toLocaleString();
    };
    
    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null;
        
        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg'
        }, [
            h('div', {
                key: 'label',
                className: 'text-xs font-medium mb-2 text-muted-foreground'
            }, `Day ${label}`),
            ...payload.map((entry, i) => {
                const route = routes.find(r => r.id === entry.dataKey);
                return h('div', {
                    key: i,
                    className: 'flex items-center justify-between gap-4 text-xs'
                }, [
                    h('div', {
                        key: 'name',
                        className: 'flex items-center gap-2'
                    }, [
                        h('div', {
                            key: 'color',
                            className: 'w-3 h-3 rounded-full',
                            style: { backgroundColor: entry.color }
                        }),
                        h('span', { key: 'text' }, route?.name || route?.bullet || entry.dataKey)
                    ]),
                    h('span', {
                        key: 'value',
                        className: 'font-mono font-medium'
                    }, formatTooltipValue(entry.value))
                ]);
            })
        ]);
    };
    
    // Common chart props
    const commonProps = {
        data: data,
        margin: { top: 20, right: 0, left: 0, bottom: 20 }
    };
    
    return h('div', {
        className: 'aa-chart w-full',
        style: { height: '400px' }
    }, 
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            chartType === 'line' ? (
                h(charts.LineChart, commonProps, [
                h(charts.CartesianGrid, {
                    key: 'grid',
                    strokeDasharray: '3 3',
                    stroke: '#374151',
                    opacity: 0.3
                }),
                h(charts.XAxis, {
                    key: 'xaxis',
                    dataKey: 'day',
                    stroke: '#9ca3af',
                    fontSize: 12,
                    tickFormatter: (day) => `Day ${day}`
                }),
                h(charts.YAxis, {
                    key: 'yaxis',
                    stroke: '#9ca3af',
                    fontSize: 12,
                    tickFormatter: formatYAxis
                }),
                h(charts.Tooltip, {
                    key: 'tooltip',
                    content: CustomTooltip
                }),
                h(charts.Legend, {
                    key: 'legend',
                    wrapperStyle: { fontSize: '12px' },
                    formatter: (value) => {
                        const route = routes.find(r => r.id === value);
                        return route?.name || route?.bullet || value;
                    }
                }),
                ...selectedRoutes.map((routeId, i) => 
                    h(charts.Line, {
                        key: routeId,
                        type: 'monotone',
                        dataKey: routeId,
                        stroke: getRouteColor(routeId),
                        strokeWidth: 2,
                        dot: { r: 3 },
                        activeDot: { r: 5 }
                    })
                )
            ])
        ) : (
            h(charts.BarChart, commonProps, [
                h(charts.CartesianGrid, {
                    key: 'grid',
                    strokeDasharray: '3 3',
                    stroke: '#374151',
                    opacity: 0.3
                }),
                h(charts.XAxis, {
                    key: 'xaxis',
                    dataKey: 'day',
                    stroke: '#9ca3af',
                    fontSize: 12,
                    tickFormatter: (day) => `Day ${day}`
                }),
                h(charts.YAxis, {
                    key: 'yaxis',
                    stroke: '#9ca3af',
                    fontSize: 12,
                    tickFormatter: formatYAxis
                }),
                h(charts.Tooltip, {
                    key: 'tooltip',
                    content: CustomTooltip
                }),
                h(charts.Legend, {
                    key: 'legend',
                    wrapperStyle: { fontSize: '12px' },
                    formatter: (value) => {
                        const route = routes.find(r => r.id === value);
                        return route?.name || route?.bullet || value;
                    }
                }),
                ...selectedRoutes.map((routeId, i) => 
                    h(charts.Bar, {
                        key: routeId,
                        dataKey: routeId,
                        fill: getRouteColor(routeId),
                        opacity: 0.8
                    })
                )
            ])
        )
    ));
}