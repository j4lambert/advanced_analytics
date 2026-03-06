// Advanced Analytics v1.0.0
//
// Historical per-route advanced analytics to Subway Builder
// https://github.com/stefanorigano/advanced_analytics

import { CONFIG } from './config.js';
import { initLifecycleHooks, getStorage, handleMapReadyFallback } from './core/lifecycle.js';
import { injectStyles } from './assets/styles.js';
import { Dashboard }    from './ui/dashboard.jsx';
import { RouteDialog }  from './ui/route/route-dialog.jsx';
import { Panel }        from './ui/panel.jsx';
import { PortalHost }   from './hooks/portal-host.jsx';

// Debug: revenue fluctuation debug
import { startRevenueDebug } from './debug/revenue-debug.js';
const DEBUG_REVENUE = false;

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api,
    config: CONFIG,
    initialized: false,
    
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

            api.ui.registerComponent('top-bar', {
                id: 'aa-dialog-mount',
                component: Dashboard
            });

            // RouteDialog — opened by clicking any interactive RouteBadge.
            // Mounted separately so it is always in the tree (independent of the
            // main Dashboard dialog being open).
            api.ui.registerComponent('top-bar', {
                id: 'aa-route-dialog-mount',
                component: RouteDialog
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

            api.ui.addButton('bottom-bar', {
                id: 'advanced-analytics-btn',
                label: 'AA Dashboard',
                icon: 'ChartPie',
                onClick: () => {
                    if (window.AdvancedAnalytics.toggleDialog) {
                        window.AdvancedAnalytics.toggleDialog();
                    }
                }
            });

            api.ui.addFloatingPanel({
                id: 'advanced-analytics-lite',
                title: 'Advanced Analytics',
                icon: 'ChartPie',
                width: 640,
                render: Panel
            });
        }

        api.hooks.onMapReady(() => {
            if (!getStorage()) {
                // Subsequent load — onGameLoaded did not fire (API bug).
                // Attempt to recover save name from Zustand and reinitialize storage.
                console.warn(`${CONFIG.LOG_PREFIX} [LC] onMapReady — storage null, subsequent load detected (API bug)`);
                handleMapReadyFallback(api);
            }

            registerUI();

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