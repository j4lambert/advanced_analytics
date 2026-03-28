// Main analytics panel component
// Toolbar state (filters, timeframe, compare mode) is persisted to IDB under
// the 'uiPreferences/dashboardTable' namespace and restored on re-open.
//
// When liveRouteData is provided by the parent (Dashboard) the component
// uses it directly instead of running its own useRouteMetrics fetch for live
// mode.  This avoids a duplicate API call and keeps both siblings in sync.

import { CONFIG, INITIAL_STATE } from '../../config.js';
import { DashboardTableToolbar } from './dashboard-table-toolbar.jsx';
import { SortableTable } from '../table.jsx';
import { getStorage } from '../../core/lifecycle.js';
import { useRouteMetrics } from '../../hooks/useRouteMetrics.js';
import { sortTableData } from '../../utils/sorting.js';
import { loadPrefs, savePrefs } from '../../hooks/useUIPreferences.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function DashboardTable({
    groups = ['trains', 'finance', 'performance'],
    liveRouteData = null,   // optional — provided by Dashboard
}) {
    // All state is local - resets when component unmounts
    const [sortState, setSortState]                     = React.useState(INITIAL_STATE.sort);
    const [groupState, setGroupState]                   = React.useState(INITIAL_STATE.groups);
    const [timeframeState, setTimeframeState]           = React.useState(INITIAL_STATE.timeframe);
    const [historicalData, setHistoricalData]           = React.useState({ days: {} });
    const [compareMode, setCompareMode]                 = React.useState(false);
    const [comparePrimaryDay, setComparePrimaryDay]     = React.useState(null);
    const [compareSecondaryDay, setCompareSecondaryDay] = React.useState(null);
    const [compareShowPercentages, setCompareShowPercentages] = React.useState(true);
    
    const storage = getStorage();

    // Ref guard: prevents the save effect from firing before preferences have been loaded
    const prefsSaveable = React.useRef(false);

    // Load historical data on mount (only data that's persisted for game saves)
    React.useEffect(() => {
        const loadHistorical = async () => {
            if (!storage) return;
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        loadHistorical();
    }, [storage]);
    
    // Poll for historical data updates
    React.useEffect(() => {
        if (!storage) return;
        
        const checkUpdates = setInterval(async () => {
            const latest = await storage.get('historicalData', { days: {} });
            if (JSON.stringify(latest) !== JSON.stringify(historicalData)) {
                setHistoricalData(latest);
            }
        }, 2000);
        
        return () => clearInterval(checkUpdates);
    }, [storage, historicalData]);

    // ── UI Preferences: load ────────────────────────────────────────────────
    // Runs once when storage becomes available. Restores previous toolbar state.
    React.useEffect(() => {
        if (prefsSaveable.current) return;
        if (!storage) return;
        loadPrefs(storage, 'dashboardTable').then(prefs => {
            if (prefs.groupState && typeof prefs.groupState === 'object') {
                // Spread into defaults so any keys added in future versions are kept
                setGroupState(prev => ({ ...prev, ...prefs.groupState }));
            }
            if (prefs.timeframeState !== undefined) {
                setTimeframeState(prefs.timeframeState);
            }
            if (typeof prefs.compareMode === 'boolean') {
                setCompareMode(prefs.compareMode);
            }
            if (prefs.comparePrimaryDay !== undefined) {
                setComparePrimaryDay(prefs.comparePrimaryDay);
            }
            if (prefs.compareSecondaryDay !== undefined) {
                setCompareSecondaryDay(prefs.compareSecondaryDay);
            }
            if (typeof prefs.compareShowPercentages === 'boolean') {
                setCompareShowPercentages(prefs.compareShowPercentages);
            }
            prefsSaveable.current = true;
        });
    }, [storage]);

    // ── UI Preferences: save ────────────────────────────────────────────────
    // Fires whenever any toolbar state changes. The prefsSaveable guard ensures
    // the initial-render defaults are never written before the load completes.
    React.useEffect(() => {
        if (!prefsSaveable.current || !storage) return;
        savePrefs(storage, 'dashboardTable', {
            groupState,
            timeframeState,
            compareMode,
            comparePrimaryDay,
            compareSecondaryDay,
            compareShowPercentages,
        });
    }, [storage, groupState, timeframeState, compareMode, comparePrimaryDay, compareSecondaryDay, compareShowPercentages]);

    // ── Data fetching ────────────────────────────────────────────────────────
    // When a parent supplies liveRouteData we only need the hook for non-live
    // modes (historical / comparison).  In those modes liveRouteData is ignored
    // anyway, so we always call useRouteMetrics but skip its output for live.
    // In live mode, pass a stable sort so user reordering doesn't trigger a
    // redundant re-fetch (sorting is applied below via sortTableData instead).
    const isLiveMode = timeframeState === 'last24h' && !compareMode && liveRouteData !== null;
    const { tableData: ownLiveData } = useRouteMetrics({
        sortState: isLiveMode ? INITIAL_STATE.sort : sortState,
        timeframeState,
        compareMode,
        comparePrimaryDay,
        compareSecondaryDay,
        historicalData,
    });

    // Decide which data to display:
    // • live mode + parent supplied data  → sort the shared liveRouteData
    // • everything else                  → use the hook's output directly
    const tableData = React.useMemo(() => {
        const isLive = timeframeState === 'last24h' && !compareMode;
        if (isLive && liveRouteData !== null) {
            return sortTableData(liveRouteData, sortState);
        }
        return ownLiveData;
    }, [timeframeState, compareMode, liveRouteData, ownLiveData, sortState]);

    // ── State updaters (no persistence) ─────────────────────────────────────
    const updateSortState = React.useCallback((newState) => {
        setSortState(newState);
    }, []);
    
    const updateGroupState = React.useCallback((groupKey) => {
        setGroupState(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
    }, []);
    
    const updateTimeframeState = React.useCallback((newTimeframe) => {
        setTimeframeState(newTimeframe);
    }, []);
    
    const updateCompareMode = React.useCallback((enabled) => {
        setCompareMode(enabled);
        
        if (enabled && historicalData.days) {
            const allDays = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
            const mostRecentDay = allDays[0];
            const dayBefore = allDays[1];
            
            if (mostRecentDay && dayBefore) {
                setComparePrimaryDay(mostRecentDay);
                setCompareSecondaryDay(dayBefore);
            }
        }
    }, [historicalData]);
    
    const updateComparePrimaryDay = React.useCallback((value) => {
        const newPrimary = Number(value);
        setComparePrimaryDay(newPrimary);
        
        // Auto-adjust secondary if now invalid
        if (compareSecondaryDay >= newPrimary) {
            setCompareSecondaryDay(newPrimary - 1);
        }
    }, [compareSecondaryDay]);
    
    const updateCompareSecondaryDay = React.useCallback((value) => {
        setCompareSecondaryDay(Number(value));
    }, []);
    
    const updateCompareShowPercentages = React.useCallback(() => {
        setCompareShowPercentages(prev => !prev);
    }, []);
    
    return (
        <>
            <section>
                <div className="py-5 flex items-center justify-between gap-8">
                    <h3 className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight">Routes Stats</h3>
                </div>
                <div className="pb-3 flex items-center justify-between gap-8">
                    <DashboardTableToolbar
                        groupState={groupState}
                        onGroupChange={updateGroupState}
                        timeframeState={timeframeState}
                        onTimeframeChange={updateTimeframeState}
                        compareMode={compareMode}
                        onCompareModeChange={updateCompareMode}
                        comparePrimaryDay={comparePrimaryDay}
                        onComparePrimaryDayChange={updateComparePrimaryDay}
                        compareSecondaryDay={compareSecondaryDay}
                        onCompareSecondaryDayChange={updateCompareSecondaryDay}
                        compareShowPercentages={compareShowPercentages}
                        onCompareShowPercentagesChange={updateCompareShowPercentages}
                        historicalData={historicalData}
                    />
                </div>
                <div className="scrollbar-thin max-w-full rounded-lg border border-foreground/20 backdrop-blur-sm text-card-foreground mb-6 flex-1 overflow-auto max-h-[40vh]">
                    <SortableTable
                        data={tableData}
                        sortState={sortState}
                        onSortChange={updateSortState}
                        groups={groups}
                        groupState={groupState}
                        compareShowPercentages={compareShowPercentages}
                    />
                </div>
            </section>
        </>
    );
}
