// Analytics Panel — unified single-panel entry point
//
// Replaces the previous two-panel system (Dashboard + RouteDialog rendered as
// separate StaticPanel instances).  A single StaticPanel is always mounted; its
// content switches between the "dashboard" and "route" views via a `view` state.
//
// NAVIGATION
//   Dashboard view  →  header: "Advanced Analytics — Dashboard"
//   Route view      →  header: "Advanced Analytics — Dashboard > Route [badge dropdown]"
//                       clicking "Dashboard" in the breadcrumb navigates back
//
// GLOBAL API  (window.AdvancedAnalytics)
//   openDialog()            — open panel, go to dashboard view
//   closeDialog()           — close panel
//   toggleDialog()          — toggle; opens to dashboard when currently closed
//   openRouteDialog(id)     — open panel, go to route view for `id`
//   closeRouteDialog()      — navigate back to dashboard (panel stays open)
//
// DATA OWNERSHIP
//   liveRouteData    — always polling (via useRouteMetrics) so data is instantly
//                      available when switching back to the dashboard view
//   historicalData   — loaded from storage while the panel is open, polled every 2 s
//
// BACKGROUND SAVINGS
//   Only the active view is rendered. When the route view is shown the dashboard
//   subtree is unmounted, stopping all its intervals and re-renders.

import { StaticPanel }     from '../components/static-panel.jsx';
import { Dropdown }        from '../components/dropdown.jsx';
import { DropdownItem }    from '../components/dropdown-item.jsx';
import { RouteBadge }      from '../components/route-badge.jsx';
import { DashboardContent } from './dashboard.jsx';
import { RouteContent }    from './route/route-dialog.jsx';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';
import { getStorage }      from '../core/lifecycle.js';
import { INITIAL_STATE }   from '../config.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Breadcrumb title component ───────────────────────────────────────────────
// Rendered inside the 36px-tall StaticPanel header.

function PanelBreadcrumb({ view, routeId, onNavDashboard, onRouteChange }) {
    if (view === 'dashboard') {
        return (
            <span className="flex items-center gap-1.5">
                Advanced Analytics — Dashboard
            </span>
        );
    }

    const routes = api.gameState.getRoutes();

    return (
        <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Advanced Analytics</span>
            <span className="text-muted-foreground text-xs">—</span>

            {/* Clickable "Dashboard" crumb */}
            <button
                className="text-xs text-foreground/70 hover:text-foreground hover:underline underline-offset-2 transition-colors"
                onClick={onNavDashboard}
            >
                Dashboard
            </button>

            {/* Separator */}
            {React.createElement(icons.ChevronRight, {
                size: 12,
                className: 'text-muted-foreground shrink-0',
            })}

            <span className="text-xs">Route</span>

            {/* Route switcher dropdown */}
            <Dropdown
                togglerClasses="flex items-center gap-1 rounded hover:bg-accent px-1.5 py-0.5 transition-colors"
                togglerContent={
                    routeId
                        ? <RouteBadge routeId={routeId} size="1rem" interactive={false} />
                        : <span className="text-muted-foreground text-xs">Select</span>
                }
                value={routeId}
                onChange={onRouteChange}
            >
                {routes.map(r => (
                    <DropdownItem key={r.id} value={r.id} route={r} />
                ))}
            </Dropdown>
        </span>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

export function AnalyticsPanel() {
    const [isOpen,         setIsOpen]         = React.useState(false);
    const [view,           setView]           = React.useState('dashboard'); // 'dashboard' | 'route'
    const [routeId,        setRouteId]        = React.useState(null);
    const [historicalData, setHistoricalData] = React.useState({ days: {} });

    const storage = getStorage();

    // ── Live data — always polling so it's fresh on view switch ──────────────
    const emptyHistoricalData = React.useMemo(() => ({ days: {} }), []);
    const { tableData: liveRouteData } = useRouteMetrics({
        sortState:      INITIAL_STATE.sort,
        timeframeState: 'last24h',
        compareMode:    false,
        historicalData: emptyHistoricalData,
    });

    // ── Historical data — poll while panel is open ────────────────────────────
    React.useEffect(() => {
        if (!isOpen || !storage) return;
        const load = async () => {
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        load();
        const id = setInterval(load, 2000);
        return () => clearInterval(id);
    }, [isOpen, storage]);

    // ── Global API ────────────────────────────────────────────────────────────
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};

        window.AdvancedAnalytics.openDialog = () => {
            setView('dashboard');
            setIsOpen(true);
        };
        window.AdvancedAnalytics.closeDialog = () => setIsOpen(false);
        window.AdvancedAnalytics.toggleDialog = () => {
            setIsOpen(prev => {
                // When opening via toggle always land on dashboard
                if (!prev) setView('dashboard');
                return !prev;
            });
        };
        window.AdvancedAnalytics.openRouteDialog = (id) => {
            setRouteId(id);
            setView('route');
            setIsOpen(true);
        };
        // Navigates back to dashboard (panel stays open)
        window.AdvancedAnalytics.closeRouteDialog = () => setView('dashboard');

        return () => {
            delete window.AdvancedAnalytics.openDialog;
            delete window.AdvancedAnalytics.closeDialog;
            delete window.AdvancedAnalytics.toggleDialog;
            delete window.AdvancedAnalytics.openRouteDialog;
            delete window.AdvancedAnalytics.closeRouteDialog;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <StaticPanel
            id="aa-analytics"
            title={
                <PanelBreadcrumb
                    view={view}
                    routeId={routeId}
                    onNavDashboard={() => setView('dashboard')}
                    onRouteChange={(id) => setRouteId(id)}
                />
            }
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            size={1280}
        >
            {isOpen && view === 'dashboard' && (
                <DashboardContent
                    liveRouteData={liveRouteData}
                    historicalData={historicalData}
                />
            )}

            {isOpen && view === 'route' && routeId && (
                <RouteContent routeId={routeId} />
            )}
        </StaticPanel>
    );
}
