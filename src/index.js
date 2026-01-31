// Advanced Analytics v5.0.0
// Modular refactored version with JSX UI components

import { CONFIG } from './config.js';
import { initLifecycleHooks } from './core/lifecycle.js';
import { injectStyles } from './ui/styles.js';
import { AnalyticsPanel } from './ui/panel.jsx';

const api = window.SubwayBuilderAPI;

console.log(`${CONFIG.LOG_PREFIX} Advanced Analytics v${CONFIG.VERSION} initializing...`);

const AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api,
    config: CONFIG,
    initialized: false,  // Flag to prevent duplicate registration
    
    init() {
        if (!api) {
            console.error(`${CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }
        
        if (this.initialized) {
            console.log(`${CONFIG.LOG_PREFIX} Already initialized, skipping`);
            return;
        }
        
        console.log(`${CONFIG.LOG_PREFIX} Architecture: Modular (16 files)`);
        console.log(`${CONFIG.LOG_PREFIX} UI: React with JSX`);
        
        // Initialize lifecycle hooks first
        initLifecycleHooks(api);
        
        // Setup game initialization hook
        api.hooks.onGameInit(() => {
            injectStyles();
            
            if (typeof api.ui.addFloatingPanel === 'function') {
                api.ui.addFloatingPanel({
                    id: 'advanced-analytics',
                    title: 'Advanced Route Analytics',
                    icon: 'ChartPie',
                    width: 980,
                    height: 600,
                    render: AnalyticsPanel  // Pass component directly
                });
                console.log(`${CONFIG.LOG_PREFIX} ✓ Floating panel registered`);
            } else {
                console.error(`${CONFIG.LOG_PREFIX} addFloatingPanel not available`);
                api.ui.showNotification('Advanced Analytics requires newer game version', 'error');
            }
        });
        
        this.initialized = true;
        console.log(`${CONFIG.LOG_PREFIX} Successfully initialized!`);
        console.log(`${CONFIG.LOG_PREFIX} ✓ All modules loaded`);
        console.log(`${CONFIG.LOG_PREFIX} ✓ JSX components ready`);
    }
};

// Export for global access
window.AdvancedAnalytics = AdvancedAnalytics;

// Auto-initialize if API is available
if (api) {
    AdvancedAnalytics.init();
}

export default AdvancedAnalytics;
