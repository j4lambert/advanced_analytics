// Configuration constants for Advanced Analytics
// __MOD_VERSION__ is injected at build time by esbuild from package.json.
// To bump the version, edit "version" in package.json only.

export const CONFIG = {
    VERSION: __MOD_VERSION__,
    
    EFFICIENCY_THRESHOLDS: {
        CRITICAL_LOW: 0.15,
        WARNING_LOW: 0.30,
    },

    LOAD_FACTOR_THRESHOLDS: {
        CRITICAL_LOW:  40,
        WARNING_LOW:   55,
        WARNING_HIGH:  80,
        CRITICAL_HIGH: 90,
    },
    
    REFRESH_INTERVAL: 1000,
    LOG_PREFIX: '[AA]',
    COST_MULTIPLIER: 365,
    
    DEMAND_HOURS: {
        low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
        medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
        high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
    },
    
    // Demand phases with precise hour boundaries
    // Used for accurate cost calculation based on when trains actually ran
    // Defaults — overwritten at init by popTiming.getCommuteTimeRanges()
    DEMAND_PHASES: [
        { type: 'low',    startHour: 0,  endHour: 5,  name: 'Night' },
        { type: 'medium', startHour: 5,  endHour: 6,  name: 'Early Morning' },
        { type: 'high',   startHour: 6,  endHour: 9,  name: 'Morning Rush' },
        { type: 'medium', startHour: 9,  endHour: 16, name: 'Midday' },
        { type: 'high',   startHour: 16, endHour: 19, name: 'Evening Rush' },
        { type: 'medium', startHour: 19, endHour: 20, name: 'Late Evening' },
        { type: 'low',    startHour: 20, endHour: 24, name: 'Late Night' },
    ],
    
    TRANSFER_WALKING_TIME_THRESHOLD: 100,  // seconds
    
    COLORS: {
        // Train Schedule Colors (Labels only)
        TRAINS: {
            HIGH: 'text-red-600 dark:text-red-400',
            MEDIUM: 'text-orange-500 dark:text-orange-400',
            LOW: 'text-green-600 dark:text-green-400'
        },
        
        // Efficiency status colors
        EFFICIENCY: {
            CRITICAL: 'text-red-600 dark:text-red-400',
            WARNING: 'text-yellow-600 dark:text-yellow-400',
            GOOD: 'text-green-600 dark:text-green-400'
        },
        
        // Percentage change colors
        PERCENTAGE: {
            POSITIVE: 'text-green-600 dark:text-green-400',
            NEGATIVE: 'text-red-600 dark:text-red-400'
        },
        
        // Value colors
        VALUE: {
            NEGATIVE: 'text-red-600 dark:text-red-400',
            DEFAULT: ''
        },
        
        // Comparison mode colors
        COMPARE: {
            POSITIVE: 'text-green-600 dark:text-green-400',  // Good improvement
            NEGATIVE: 'text-red-600 dark:text-red-400',      // Decline
            NEUTRAL: 'text-muted-foreground',                // No change (0%)
            NEW: 'text-purple-600 dark:text-purple-400',     // New route
            DELETED: 'text-gray-400 dark:text-gray-500'      // Deleted route
        }
    },
    
    ARROWS: {
        UP: '↑',
        DOWN: '↓',
        NEUTRAL: '='
    },
    
    STYLES: {
        PERCENTAGE_FONT_SIZE: 'text-[10px]'
    },
    
    TABLE_HEADERS: [
        { key: 'name', label: 'Route', align: 'right'},
        { key: 'ridership', label: 'Ridership', align: 'right', group: 'performance' },
        { key: 'capacity', label: 'Throughput', align: 'right', group: 'trains', description: 'Daily Capacity: one-directional passenger capacity over 24 hours' },
        { key: 'loadFactor', label: 'Load Factor', align: 'right', group: 'performance', description: 'Peak segment load ÷ train capacity|How full trains are at their busiest point on average|Time-averaged: short rush-hour spikes may not be reflected|Values above 100% indicate sustained overcrowding|For real-time overloads check the game Capacity Warnings' },
        { key: 'efficiency', label: 'Performance', align: 'right', group: 'performance', description: 'Ridership ÷ bidirectional throughput capacity|1.0× = all seats filled end-to-end once|Above 1.0× = high turnover (good — not overcrowding)|Below 1.0× = unused capacity' },
        { key: 'stations', label: 'Stops', align: 'right', group: 'trains' },
        { key: 'trainType', label: 'Type', align: 'right', group: 'trains', description: 'Train Type' },
        { key: 'trainSchedule', label: 'Trains', align: 'right', group: 'trains', description: 'Number of trains:|- High Demand |- Medium Demand |- Low Demand)' },
        { key: 'transfers', label: 'Transfers', align: 'right', group: 'trains', description: 'Direct transfers with other routes |Note: List direct transfers only, passengers may walk to further stations not listed here ' },
        { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
        { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
        { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
        { key: 'profitPerTrain', label: 'Profit/Train', align: 'right', group: 'finance' }
    ]
};

// Initial state values
export const INITIAL_STATE = {
    sort: {
        column: 'ridership',
        order: 'desc'
    },
    
    groups: {
        trains: true,
        finance: true,
        performance: true
    },
    
    timeframe: 'last24h'
};
