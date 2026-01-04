// Advanced Analytics Mod for Subway Builder v3.0
// Using addFloatingPanel API for React-powered updates

const AdvancedAnalytics = {
    // API References (cached on init)
    api: null,
    React: null,
    h: null,
    
    // State
    sortState: {
        column: 'ridership',
        order: 'desc'
    },
    
    // Debug mode: Set to true to pause data updates (useful for inspecting data in console)
    // When true, the panel will load once but won't auto-refresh
    debug: false,

    // Configuration
    CONFIG: {
        UTILIZATION_THRESHOLDS: {
            CRITICAL_LOW: 30,
            CRITICAL_HIGH: 95,
            WARNING_LOW: 45,
            WARNING_HIGH: 85
        },
        REFRESH_INTERVAL: 1000,
        LOG_PREFIX: '[AA]',
        COST_MULTIPLIER: 365,
        DEMAND_HOURS: {
            low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
            medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
            high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
        },
        TABLE_HEADERS: [
            { key: 'name', label: 'Route', align: 'right' },
            { key: 'ridership', label: 'Ridership', align: 'right' },
            { key: 'capacity', label: 'Capacity', align: 'right' },
            { key: 'utilization', label: 'Use', align: 'right' },
            { key: 'stations', label: 'Stations', align: 'right' },
            { key: 'dailyCost', label: 'Cost', align: 'right' },
            { key: 'dailyRevenue', label: 'Revenue', align: 'right' },
            { key: 'dailyProfit', label: 'Profit', align: 'right' },
            { key: 'costPerPassenger', label: 'Cost/Pax', align: 'right' }
        ]
    },

    init() {
        if (!window.SubwayBuilderAPI) {
            console.error(`${this.CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }

        // Cache API references for reuse throughout the module
        this.api = window.SubwayBuilderAPI;
        this.React = this.api.utils.React;
        this.h = this.React.createElement;

        this.api.hooks.onGameInit(() => {
            console.log(`${this.CONFIG.LOG_PREFIX} Mod initialized`);

            this.injectStyles();
            
            // Register floating panel (creates toolbar button automatically)
            if (typeof this.api.ui.addFloatingPanel === 'function') {
                this.api.ui.addFloatingPanel({
                    id: 'advanced-analytics',
                    title: 'Advanced Route Analytics',
                    icon: 'ChartPie',
                    width: 800,
                    height: 600,
                    render: () => this.renderAnalyticsPanel()
                });
                console.log(`${this.CONFIG.LOG_PREFIX} Floating panel registered`);
            } else {
                console.error(`${this.CONFIG.LOG_PREFIX} addFloatingPanel not available`);
                this.api.ui.showNotification('Advanced Analytics requires newer game version', 'error');
            }
        });
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            html.dark #advanced-analytics {
                color-scheme: dark;
            }
            #advanced-analytics {
                scrollbar-width: thin;
            }
            #advanced-analytics thead tr,
            #advanced-analytics th:first-child,
            #advanced-analytics td:first-child {
                position: sticky;
                left: 0;
            }
            div:has(>#advanced-analytics) {
                padding: 0; 
            }
            .rounded-lg.backdrop-blur-md:has(div > #advanced-analytics) {
                background-color: transparent; 
            }
            .rounded-lg.backdrop-blur-md:has(div > #advanced-analytics) > div:first-child {
                background-color: hsl(var(--background)); 
            }
        `;
        document.head.appendChild(style);
    },

    renderAnalyticsPanel() {
        // Use cached references instead of fetching again
        const api = this.api;
        const { React } = this;
        const h = this.h;

        // Main panel component with React hooks
        const AnalyticsPanel = () => {
            const [tableData, setTableData] = React.useState([]);
            const [sortState, setSortState] = React.useState(this.sortState);

            // Fetch and update data
            React.useEffect(() => {
                const updateData = () => {
                    const routes = api.gameState.getRoutes();
                    const trainTypes = api.trains.getTrainTypes();
                    const lineMetrics = api.gameState.getLineMetrics();
                    const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;

                    const processedData = [];

                    routes.forEach(route => {
                        const metrics = lineMetrics.find(m => m.routeId === route.id);
                        const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
                        const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
                        const dailyRevenue = revenuePerHour * 24;

                        if (!this.validateRouteData(route)) {
                            processedData.push({
                                id: route.id,
                                name: route.name || route.bullet,
                                ridership,
                                dailyRevenue,
                                ...this.getEmptyMetrics()
                            });
                            return;
                        }

                        const trainType = trainTypes[route.trainType];
                        if (!trainType) {
                            processedData.push({
                                id: route.id,
                                name: route.name || route.bullet,
                                ridership,
                                dailyRevenue,
                                ...this.getEmptyMetrics()
                            });
                            return;
                        }

                        const metrics_calc = this.calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                        
                        processedData.push({
                            id: route.id,
                            name: route.name || route.bullet,
                            ridership,
                            dailyRevenue,
                            ...metrics_calc
                        });
                    });

                    // Sort data
                    const column = sortState.column;
                    const order = sortState.order;

                    processedData.sort((a, b) => {
                        let aVal = a[column];
                        let bVal = b[column];

                        if (column === 'name') {
                            return order === 'desc' 
                                ? bVal.localeCompare(aVal)
                                : aVal.localeCompare(bVal);
                        }

                        return order === 'desc' ? bVal - aVal : aVal - bVal;
                    });

                    setTableData(processedData);
                };

                // Always fetch data initially
                updateData();
                
                // Only set up auto-refresh if NOT in debug mode
                if (!this.debug) {
                    const interval = setInterval(() => {
                        // Only update if game is not paused
                        if (!api.gameState.isPaused()) {
                            updateData();
                        }
                    }, this.CONFIG.REFRESH_INTERVAL);
                    return () => clearInterval(interval);
                }
                // In debug mode, no interval is set up, so no cleanup needed
            }, [sortState]);

            const handleSort = (column) => {
                const newSortState = {
                    column,
                    order: sortState.column === column 
                        ? (sortState.order === 'desc' ? 'asc' : 'desc')
                        : 'desc'
                };
                this.sortState = newSortState;
                setSortState(newSortState);
            };

            return h('div', { 
                id: 'advanced-analytics',
                className: 'flex flex-col h-full overflow-hidden'
            }, [
                h('div', { 
                    key: 'table-container',
                    className: 'flex-1 overflow-auto'
                }, this.buildReactTable(tableData, sortState, handleSort))
            ]);
        };

        return h(AnalyticsPanel);
    },

    buildReactTable(data, sortState, handleSort) {
        const api = window.SubwayBuilderAPI;
        const { React } = api.utils;
        const h = React.createElement;

        return h('table', { className: 'w-full text-sm border-collapse' }, [
            // thead
            h('thead', { key: 'thead', className: 'z-10 relative' }, 
                h('tr', { className: 'top-0 border-b bg-primary-foreground/60 backdrop-blur-sm' },
                    this.CONFIG.TABLE_HEADERS.map(header => 
                        h('th', {
                            key: header.key,
                            className: `h-12 px-3 text-${header.align} align-middle font-medium whitespace-nowrap cursor-pointer transition-colors ${this.getHeaderClasses(header.key, sortState)}`,
                            onClick: () => handleSort(header.key)
                        }, [
                            h('span', { 
                                key: 'indicator',
                                className: sortState.column !== header.key ? 'opacity-0' : '' 
                            }, this.getSortIndicator(header.key, sortState)),
                            ' ' + header.label
                        ])
                    )
                )
            ),
            // tbody
            h('tbody', { key: 'tbody', className: 'z-0' },
                data.map((row, rowIndex) => {
                    // Find baseline for percentage calculations
                    let baselineRow = null;
                    if (sortState.column === 'dailyCost' || sortState.column === 'dailyRevenue' || sortState.column === 'dailyProfit' || sortState.column === 'costPerPassenger') {
                        const valueKey = sortState.column;
                        // For profit, we need the first row (regardless of sign), for others we need first positive value
                        if (sortState.column === 'dailyProfit') {
                            baselineRow = data[0]; // First row in sorted order
                        } else {
                            baselineRow = data.find(r => r[valueKey] > 0);
                        }
                    }
                    const showCostPercentage = baselineRow && rowIndex > 0;

                    return h('tr', {
                        key: row.id,
                        className: 'border-b transition-colors hover:bg-background/50'
                    }, [
                        // Route name
                        h('td', {
                            key: 'name',
                            className: `px-3 py-2 align-middle text-right w-0 font-medium bg-primary-foreground/60 backdrop-blur-sm ${this.getCellClasses('name', sortState)}`
                        }, row.name),
                        
                        // Ridership
                        h('td', {
                            key: 'ridership',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('ridership', sortState)}`
                        }, row.ridership.toLocaleString()),
                        
                        // Capacity
                        h('td', {
                            key: 'capacity',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('capacity', sortState)}`
                        }, row.capacity > 0 ? row.capacity.toLocaleString() : 'N/A'),
                        
                        // Utilization
                        h('td', {
                            key: 'utilization',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('utilization', sortState)} ${row.utilization > 0 ? this.getUtilizationClasses(row.utilization) : ''}`
                        }, row.utilization > 0 ? '∿' + row.utilization + '%' : 'N/A'),
                        
                        // Stations
                        h('td', {
                            key: 'stations',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('stations', sortState)}`
                        }, row.stations > 0 ? row.stations : 'N/A'),
                        
                        // Daily cost
                        this.createReactCostCell(
                            'dailyCost',
                            row.dailyCost > 0 ? '$' + row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A',
                            showCostPercentage && row.dailyCost > 0 && sortState.column === 'dailyCost' 
                                ? this.calculatePercentageChange(row.dailyCost, baselineRow.dailyCost) 
                                : null,
                            sortState
                        ),

                        // Daily revenue
                        this.createReactRevenueCell(
                            'dailyRevenue',
                            row.dailyRevenue > 0 ? '$' + row.dailyRevenue.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A',
                            showCostPercentage && row.dailyRevenue > 0 && sortState.column === 'dailyRevenue' 
                                ? this.calculatePercentageChange(row.dailyRevenue, baselineRow.dailyRevenue) 
                                : null,
                            sortState
                        ),

                        // Daily profit (with special handling for negative values)
                        this.createReactProfitCell(
                            'dailyProfit',
                            row.dailyProfit,
                            showCostPercentage && sortState.column === 'dailyProfit' 
                                ? this.calculatePercentageChange(row.dailyProfit, baselineRow.dailyProfit) 
                                : null,
                            sortState
                        ),
                        
                        // Cost per passenger
                        this.createReactCostCell(
                            'costPerPassenger',
                            row.costPerPassenger > 0 ? '$' + row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A',
                            showCostPercentage && row.costPerPassenger > 0 && sortState.column === 'costPerPassenger'
                                ? this.calculatePercentageChange(row.costPerPassenger, baselineRow.costPerPassenger)
                                : null,
                            sortState
                        )
                    ]);
                })
            )
        ]);
    },

    createReactCostCell(columnKey, content, percentageChange, sortState) {
        // Use cached references
        const h = this.h;

        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState)}`
        }, 
            h('div', { className: 'flex flex-col items-end gap-0.5' }, [
                h('div', { key: 'value' }, content),
                percentageChange !== null && h('div', {
                    key: 'percent',
                    className: `text-[10px] ${percentageChange > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`
                }, `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`)
            ])
        );
    },

    createReactRevenueCell(columnKey, content, percentageChange, sortState) {
        // Use cached references
        const h = this.h;

        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState)}`
        }, 
            h('div', { className: 'flex flex-col items-end gap-0.5' }, [
                h('div', { key: 'value' }, content),
                percentageChange !== null && h('div', {
                    key: 'percent',
                    // Revenue: increase = good (green), decrease = bad (red)
                    className: `text-[10px] ${percentageChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`
                }, `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`)
            ])
        );
    },

    createReactProfitCell(columnKey, profitValue, percentageChange, sortState) {
        // Use cached references
        const h = this.h;

        // Format the profit value with proper negative formatting
        const isNegative = profitValue < 0;
        const absValue = Math.abs(profitValue);
        const formattedValue = isNegative 
            ? `-$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`
            : `$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;

        // Determine text color based on profit value
        const valueColorClass = isNegative 
            ? 'text-red-600 dark:text-red-400' 
            : '';

        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState)}`
        }, 
            h('div', { className: 'flex flex-col items-end gap-0.5' }, [
                h('div', { 
                    key: 'value',
                    className: valueColorClass
                }, formattedValue),
                percentageChange !== null && h('div', {
                    key: 'percent',
                    className: `text-[10px] ${percentageChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`
                }, `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`)
            ])
        );
    },

    calculateRouteMetrics(route, trainType, ridership, dailyRevenue) {
        const carsPerTrain = route.carsPerTrain !== undefined 
            ? route.carsPerTrain 
            : trainType.stats.carsPerCarSet;
        
        const capacityPerCar = trainType.stats.capacityPerCar;
        const capacityPerTrain = carsPerTrain * capacityPerCar;

        const schedule = route.trainSchedule || {};
        const trainCounts = {
            high: schedule.highDemand || 0,
            medium: schedule.mediumDemand || 0,
            low: schedule.lowDemand || 0
        };

        let capacity = 0;
        let utilization = 0;
        let dailyCost = 0;

        if (route.stComboTimings && route.stComboTimings.length > 0) {
            const timings = route.stComboTimings;
            const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;

            if (loopTimeSeconds > 0) {
                const loopsPerHour = 3600 / loopTimeSeconds;

                const highCapacity = trainCounts.high * this.CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
                const mediumCapacity = trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
                const lowCapacity = trainCounts.low * this.CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;

                capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);

                if (capacity > 0) {
                    utilization = Math.round((ridership / capacity) * 100);
                }

                const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const carCostPerHour = trainType.stats.carOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

                dailyCost = (trainCounts.low * this.CONFIG.DEMAND_HOURS.low * costPerTrainPerHour) +
                            (trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour) +
                            (trainCounts.high * this.CONFIG.DEMAND_HOURS.high * costPerTrainPerHour);
            }
        }

        const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
        const costPerPassenger = ridership > 0 ? dailyCost / ridership : 0;
        const dailyProfit = dailyRevenue - dailyCost;

        return {
            capacity,
            utilization,
            stations,
            dailyCost,
            dailyProfit,
            costPerPassenger
        };
    },

    // Helper methods
    validateRouteData(route) {
        return route && route.trainSchedule;
    },

    getEmptyMetrics() {
        return {
            capacity: 0,
            utilization: 0,
            stations: 0,
            dailyCost: 0,
            dailyRevenue: 0,
            dailyProfit: 0,
            costPerPassenger: 0
        };
    },

    getUtilizationClasses(utilization) {
        const thresholds = this.CONFIG.UTILIZATION_THRESHOLDS;
        
        if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
            return 'text-red-600 dark:text-red-400';
        } else if ((utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW) || 
                   (utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH)) {
            return 'text-yellow-600 dark:text-yellow-400';
        }
        return 'text-green-600 dark:text-green-400';
    },

    calculatePercentageChange(currentValue, baselineValue) {
        if (baselineValue === 0) return null;
        
        // For negative baselines (like negative profits), we need special handling
        // to ensure the percentage reflects whether things got better or worse
        if (baselineValue < 0) {
            // If baseline is negative, getting less negative is an improvement
            // Example: baseline = -100, current = -50 → +50% improvement (positive)
            // Example: baseline = -100, current = -150 → -50% decline (negative)
            return ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100;
        }
        
        // Standard percentage change for positive baselines
        return ((currentValue - baselineValue) / baselineValue) * 100;
    },

    getHeaderClasses(column, sortState) {
        if (sortState.column === column) {
            return 'text-foreground bg-background/80';
        } else if (column === 'name') {
            return 'bg-background/50 backdrop-blur-sm';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column, sortState) {
        if (sortState.column === column) {
            return 'bg-background/80';
        } else if (column === 'name') {
            return 'bg-background/50 backdrop-blur-sm';
        }
        return '';
    },

    getSortIndicator(column, sortState) {
        if (sortState.column !== column) {
            return '↓';
        }
        return sortState.order === 'desc' ? '↓' : '↑';
    }
};

// Initialize mod
AdvancedAnalytics.init();

// Expose to window for debugging
window.AdvancedAnalytics = AdvancedAnalytics;