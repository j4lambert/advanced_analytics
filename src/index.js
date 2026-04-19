// Advanced Analytics
// Version is injected at build time — see package.json and esbuild.config.js
//
// Historical per-route advanced analytics to Subway Builder
// https://github.com/stefanorigano/advanced_analytics

import { CONFIG } from './config.js';
import { initLifecycleHooks, getStorage, handleMapReadyFallback } from './core/lifecycle.js';
import { getRoute24hStats } from './metrics/accumulator.js';
import { computeSystemAggregates } from './metrics/system-aggregates.js';
import { injectStyles } from './assets/styles.js';
import { AnalyticsPanel } from './ui/analytics-panel.jsx';
import { TopBar }         from './ui/topbar/topbar.jsx';
import { Panel }           from './ui/panel.jsx';
import { PortalHost }   from './hooks/portal-host.jsx';
import { ToastHost }    from './components/ToastHost.jsx';
import { notify, notifyDialog } from './hooks/toast.js';
import { DebugPanel } from './ui/debug/DebugPanel.jsx';
import { showChangelogIfNeeded } from './ui/changelog/ChangelogToast.jsx';

// Debug: revenue fluctuation debug
import { startRevenueDebug } from './debug/revenue-debug.js';
const DEBUG_REVENUE = false;

// Set via "debug" key in package.json — injected at build time.
// When true, registers the debug floating panel.
const DEBUG = __DEBUG__;

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api,
    config: CONFIG,
    initialized: false,
    notify,
    notifyDialog,

    getNetworkMetrics() {
        const routes = api.gameState.getRoutes() ?? [];

        // Build per-route stat objects (same shape as liveRouteData in the dashboard)
        const routeStats = routes.map(route => {
            const s = getRoute24hStats(route.id);
            return { ...s, id: route.id, name: route.name || route.bullet };
        });

        // Use the shared aggregation (ridership-weighted, identical to SystemStats)
        const agg = computeSystemAggregates(routeStats);

        return {
            ...agg,
            // Expose per-route breakdown
            routeStats: routeStats.map(s => ({
                id:          s.id,
                name:        s.name,
                ridership:   s.ridership    ?? 0,
                revenue:     s.dailyRevenue ?? 0,
                cost:        s.dailyCost    ?? 0,
                profit:      s.dailyProfit  ?? 0,
                loadFactor:  s.loadFactor   ?? 0,  // 0–100 %
                totalTrains: s.totalTrains  ?? 0,
            })),
        };
    },

    init() {
        if (!api) {
            console.error(`${CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }
        
        if (this.initialized) {
            return;
        }
        
        // Initialize lifecycle hooks first
        initLifecycleHooks(api);
        
        // Setup game initialization hook
        function registerUI() {
            injectStyles();

            // Persistent compact metrics bar — always visible at the top of
            // the viewport, centered between the game's left/right chrome.
            api.ui.registerComponent('top-bar', {
                id: 'aa-topbar',
                component: TopBar
            });

            // Single panel — manages both the dashboard and route views.
            // Replaces the previous Dashboard + RouteDialog dual-panel system.
            api.ui.registerComponent('top-bar', {
                id: 'aa-analytics-panel',
                component: AnalyticsPanel
            });

            // PortalHost acts as a rendering target for the Portal component:
            // any Dropdown menu, Dialog backdrop, or Tooltip that needs to
            // escape a clipping/transform ancestor pushes its JSX here via
            // window.AdvancedAnalytics._portalRegistry.
            // Since PortalHost lives outside all panels, position:fixed on its
            // children is relative to the real viewport, not a transformed
            // ancestor.
            api.ui.registerComponent('top-bar', {
                id: 'aa-portal-host',
                component: PortalHost
            });

            api.ui.registerComponent('top-bar', {
                id: 'aa-toast-host',
                component: ToastHost
            });

            api.ui.addButton('bottom-bar', {
                id: 'advanced-analytics-btn',
                label: 'Dashboard',
                icon: 'Eclipse',
                onClick: () => {
                    if (window.AdvancedAnalytics.toggleDialog) {
                        window.AdvancedAnalytics.toggleDialog();
                    }
                }
            });

            api.ui.addFloatingPanel({
                id: 'advanced-analytics-lite',
                title: 'Advanced Analytics',
                icon: 'Eclipse',
                width: 640,
                render: Panel
            });

            if (DEBUG) {
                api.ui.addFloatingPanel({
                    id: 'advanced-analytics-debug',
                    title: 'AA Debug',
                    icon: 'Bug',
                    width: 320,
                    render: DebugPanel
                });
            }
        }

        api.hooks.onMapReady(() => {
            if (!getStorage()) {
                // Subsequent load — onGameLoaded did not fire (API bug).
                // Attempt to recover save name from Zustand and reinitialize storage.
                console.warn(`${CONFIG.LOG_PREFIX} [LC] onMapReady — storage null, subsequent load detected (API bug)`);
                handleMapReadyFallback(api);
            }

            registerUI();
            showChangelogIfNeeded();

            // Debug Revenues
            if (DEBUG_REVENUE) {
                if (window.AdvancedAnalytics.revenueDebug) {
                    window.AdvancedAnalytics.revenueDebug.stop();
                }
                window.AdvancedAnalytics.revenueDebug = startRevenueDebug(api);
            }
        });

        this.initialized = true;
    }
};

// Export for global access
window.AdvancedAnalytics = AdvancedAnalytics;

// Auto-initialize if API is available
if (api) {
    AdvancedAnalytics.init();
}

export default AdvancedAnalytics;