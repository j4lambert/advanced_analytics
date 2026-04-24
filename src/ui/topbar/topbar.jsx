// TopBar — compact system-metrics bar rendered in the 'top-bar' slot.
// Always visible at the top of the viewport, centered to avoid game chrome.
//
// ARCHITECTURE
//   Registered as a standalone top-bar slot component (not nested inside
//   AnalyticsPanel), so it manages its own metric polling and preferences.
//   It owns the Settings dialog state and exposes openSettings() globally
//   so TopBarSettingsTrigger (inside DashboardContent) can call it without
//   prop threading.
//
// EXTENSIBILITY
//   window.AdvancedAnalytics.topBar.register(id, renderFn)  — add a chip
//   window.AdvancedAnalytics.topBar.unregister(id)           — remove a chip
//   window.AdvancedAnalytics.topBar.openSettings()           — open dialog
//   renderFn signature: (metrics: AggregateObject | null) => ReactElement

import { SettingsDialog }          from '../settings/settings-dialog.jsx';
import { Tooltip }                 from '../../components/tooltip.jsx';
import { getStorage }              from '../../core/lifecycle.js';
import { getRoute24hStats }        from '../../metrics/accumulator.js';
import { computeSystemAggregates } from '../../metrics/system-aggregates.js';
import { computeAdherenceSnapshot } from '../../metrics/historical-data.js';
import { loadPrefs, savePrefs }    from '../../hooks/useUIPreferences.js';
import { setAlertsMuted }          from '../alerts/alerts-engine.js';
import { CONFIG } from "../../config";

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Color / label helpers ─────────────────────────────────────────────────────
// Inlined here to keep TopBar self-contained (avoids coupling to system-stats).

function loadColor(pct) {
    if (pct === 0) return 'text-muted-foreground';
    if (pct < 20) return CONFIG.COLORS.TEXT.DANGER;
    if (pct < 40) return CONFIG.COLORS.TEXT.WARNING;
    if (pct < 80) return CONFIG.COLORS.TEXT.SUCCESS;
    if (pct < 95) return CONFIG.COLORS.TEXT.WARNING;
    return '';
}
function loadLabel(pct) {
    if (pct === 0) return 'N/A';
    if (pct < 20) return 'Under-served';
    if (pct < 40) return 'Light';
    if (pct < 80) return 'Healthy';
    if (pct < 95) return 'Heavy';
    return 'Overcrowded';
}
function healthColor(score) {
    if (score === 0) return '';
    if (score < 40) return CONFIG.COLORS.TEXT.DANGER;
    if (score < 60) return CONFIG.COLORS.TEXT.WARNING;
    if (score < 75) return CONFIG.COLORS.TEXT.SUCCESS;
    return 'text-muted-foreground';
}
function healthLabel(score) {
    if (score === 0) return 'N/A';
    if (score < 40) return 'Poor';
    if (score < 60) return 'Fair';
    if (score < 75) return 'Good';
    if (score < 90) return 'Very Good';
    return 'Excellent';
}
function adherenceColor(score) {
    if (score === null) return 'text-muted-foreground';
    if (score >= 90) return CONFIG.COLORS.TEXT.SUCCESS;
    if (score >= 70) return CONFIG.COLORS.TEXT.WARNING;
    return CONFIG.COLORS.TEXT.DANGER;
}
function adherenceLabel(score) {
    if (score === null) return 'N/A';
    if (score >= 90) return 'Good';
    if (score >= 70) return 'Fair';
    return 'Poor';
}

// ── Compact metric chip ───────────────────────────────────────────────────────

function MetricChip({ value, unit, label, color, Icon, onClick, tooltipTitle, tooltipDesc }) {
    const chip = (
        <div
            className="aa-topbar-chip flex items-center gap-1.5 px-2 py-0.5 cursor-pointer"
            onClick={onClick}
            role="button"
        >
            {Icon && <Icon size={14} className="shrink-0" />}
            <div className={`flex items-center`}>
                <span className={`text-sm font-bold tracking-tight tabular-nums leading-none ${color}`}>
                    {value}
                </span>
                {unit && (
                    <span className={`text-[10px] font-bold leading-none ${color}`}>
                        {unit}
                    </span>
                )}
            </div>
            <span className="text-xs font-semibold leading-none">
                {label}
            </span>
        </div>
    );

    if (tooltipTitle) {
        return (
            <Tooltip side="bottom" content={
                <div>
                    <div className="font-semibold">{tooltipTitle}</div>
                    {tooltipDesc && <div className="text-xs opacity-75 mt-0.5">{tooltipDesc}</div>}
                </div>
            }>
                {chip}
            </Tooltip>
        );
    }
    return chip;
}

// ── Root component ────────────────────────────────────────────────────────────

export function TopBar() {
    const [metrics,           setMetrics]           = React.useState(null);
    const [adherenceScore,    setAdherenceScore]    = React.useState(null);
    const [isSettingsOpen,    setIsSettingsOpen]    = React.useState(false);
    const [isTopbarElevated,  setIsTopbarElevated]  = React.useState(false);
    const [showLoadFactor,    setShowLoadFactor]    = React.useState(true);
    const [showPerformance,   setShowPerformance]   = React.useState(true);
    const [showAdherence,     setShowAdherence]     = React.useState(true);
    const [showAlertsButton,  setShowAlertsButton]  = React.useState(true);
    const [alertsMuted,       setAlertsMutedState]  = React.useState(false);
    const [isAlertHovered,    setIsAlertHovered]    = React.useState(false);
    const [extChips,          setExtChips]          = React.useState(new Map());

    const storage        = getStorage();
    const prefsSaveable  = React.useRef(false);
    const alertHoverTimer = React.useRef(null);

    // ── Load preferences ──────────────────────────────────────────────────────
    React.useEffect(() => {
        if (prefsSaveable.current) return;
        if (!storage) return;
        loadPrefs(storage, 'topbar').then(prefs => {
            if (prefs.showLoadFactor    !== undefined) setShowLoadFactor(prefs.showLoadFactor);
            if (prefs.showPerformance   !== undefined) setShowPerformance(prefs.showPerformance);
            if (prefs.showAdherence     !== undefined) setShowAdherence(prefs.showAdherence);
            if (prefs.showAlertsButton  !== undefined) setShowAlertsButton(prefs.showAlertsButton);
            prefsSaveable.current = true;
        });
        loadPrefs(storage, 'alerts').then(prefs => {
            if (prefs.muted !== undefined) {
                setAlertsMutedState(prefs.muted);
                setAlertsMuted(prefs.muted);
            }
        });
    }, [storage]);

    // ── Save preferences ──────────────────────────────────────────────────────
    React.useEffect(() => {
        if (!prefsSaveable.current || !storage) return;
        savePrefs(storage, 'topbar', { showLoadFactor, showPerformance, showAdherence, showAlertsButton });
    }, [storage, showLoadFactor, showPerformance, showAdherence, showAlertsButton]);

    React.useEffect(() => {
        if (!prefsSaveable.current || !storage) return;
        savePrefs(storage, 'alerts', { muted: alertsMuted });
    }, [storage, alertsMuted]);

    // ── Metrics polling ───────────────────────────────────────────────────────
    React.useEffect(() => {
        function poll() {
            const routes     = api.gameState.getRoutes() ?? [];
            const routeStats = routes.map(route => ({
                ...getRoute24hStats(route.id),
                id: route.id,
            }));
            const agg = computeSystemAggregates(routeStats);
            setMetrics(agg.totalLines > 0 ? agg : null);

            const { systemAdherenceScore } = computeAdherenceSnapshot(api);
            setAdherenceScore(systemAdherenceScore);
        }
        poll();
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
    }, []);

    // ── Global API ────────────────────────────────────────────────────────────
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};
        window.AdvancedAnalytics.topBar = {
            openSettings: () => setIsSettingsOpen(true),
            register: (id, renderFn) => {
                setExtChips(prev => new Map(prev).set(id, renderFn));
            },
            unregister: (id) => {
                setExtChips(prev => {
                    const next = new Map(prev);
                    next.delete(id);
                    return next;
                });
            },
        };
        return () => {
            delete window.AdvancedAnalytics.topBar;
        };
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    const hasBuiltinChips = (metrics && (showLoadFactor || showPerformance)) || showAdherence;
    const hasExtChips     = extChips.size > 0;

    function handleClose() {
        setIsSettingsOpen(false);
        setIsTopbarElevated(false);
    }

    function handleToggleMute() {
        const next = !alertsMuted;
        setAlertsMutedState(next);
        setAlertsMuted(next);
    }

    function handleAlertAreaEnter() {
        if (alertHoverTimer.current) clearTimeout(alertHoverTimer.current);
        setIsAlertHovered(true);
    }

    function handleAlertAreaLeave() {
        alertHoverTimer.current = setTimeout(() => setIsAlertHovered(false), 200);
    }

    const settingsDialog = (
        <SettingsDialog
            isOpen={isSettingsOpen}
            onClose={handleClose}
            storage={storage}
            showLoadFactor={showLoadFactor}
            showPerformance={showPerformance}
            showAdherence={showAdherence}
            onToggleLoadFactor={() => setShowLoadFactor(v => !v)}
            onTogglePerformance={() => setShowPerformance(v => !v)}
            onToggleAdherence={() => setShowAdherence(v => !v)}
            showAlertsButton={showAlertsButton}
            onToggleAlertsButton={() => setShowAlertsButton(v => !v)}
            onTopbarSectionHover={setIsTopbarElevated}
        />
    );

    if (!hasBuiltinChips && !hasExtChips) {
        // Still render the Settings dialog even when the bar is hidden,
        // so the cog button in the dashboard remains functional.
        return settingsDialog;
    }

    return (
        <>
            <section className={`aa-topbar-wrapper overflow-visible flex justify-center fixed top-0 pt-2 left-0 w-full pointer-events-none gap-2${isTopbarElevated ? ' z-[1000]' : ''}`}>
                <div className="aa-topbar-bar bg-background border rounded-lg flex gap-1 p-2 pointer-events-auto">

                    {/* Load Factor chip */}
                    {metrics && showLoadFactor && (
                        <MetricChip
                            value={metrics.loadFactor.toFixed(1)}
                            unit="%"
                            label={loadLabel(metrics.loadFactor)}
                            color={loadColor(metrics.loadFactor)}
                            Icon={icons.Gauge}
                            onClick={() => window.AdvancedAnalytics.openDialog?.()}
                            tooltipTitle="System Load Factor"
                            tooltipDesc="Ridership-weighted avg. peak segment load"
                        />
                    )}

                    {/* Divider between Load Factor and Performance chips */}
                    {metrics && showLoadFactor && showPerformance && (
                        <div className="w-px bg-border/50 self-stretch my-1" />
                    )}

                    {/* Performance / Health Score chip */}
                    {metrics && showPerformance && (
                        <MetricChip
                            value={Math.round(metrics.healthScore)}
                            unit={null}
                            label={healthLabel(metrics.healthScore)}
                            color={healthColor(metrics.healthScore)}
                            Icon={icons.HeartPulse}
                            onClick={() => window.AdvancedAnalytics.openDialog?.()}
                            tooltipTitle="Network Health Score"
                            tooltipDesc="Ridership-weighted load factor quality (0–100)"
                        />
                    )}

                    {/* Divider before Adherence chip */}
                    {(metrics && (showLoadFactor || showPerformance)) && showAdherence && (
                        <div className="w-px bg-border/50 self-stretch my-1" />
                    )}

                    {/* Schedule Adherence chip */}
                    {showAdherence && (
                        <MetricChip
                            value={adherenceScore ?? 0}
                            unit="%"
                            label={adherenceLabel(adherenceScore)}
                            color={adherenceColor(adherenceScore)}
                            Icon={icons.Clock}
                            onClick={() => window.AdvancedAnalytics.openTimetableDialog?.()}
                            tooltipTitle="Schedule Adherence"
                            tooltipDesc={`% of stops within ±${CONFIG.ADHERENCE_THRESHOLDS.ON_TIME_SEC}s of schedule`}
                        />
                    )}

                    {/* Divider before injected chips */}
                    {hasExtChips && hasBuiltinChips && (
                        <div className="w-px bg-border/50 self-stretch my-1" />
                    )}

                    {/* Chips injected by external mods */}
                    {[...extChips.entries()].map(([id, renderFn]) => (
                        <React.Fragment key={id}>
                            {renderFn(metrics)}
                        </React.Fragment>
                    ))}

                    {/* Alerts mute toggle + hover-reveal settings cog */}
                    {showAlertsButton && (
                        <>
                            <div className="w-px bg-border/50 self-stretch my-1" />

                            {/* Hover container — covers bell + floating cog so no gap triggers leave */}
                            <div
                                className="relative flex items-center"
                                onMouseEnter={handleAlertAreaEnter}
                                onMouseLeave={handleAlertAreaLeave}
                            >
                                <Tooltip side="bottom" content={
                                    <div>
                                        <div className="font-semibold">{alertsMuted ? 'Alerts muted' : 'Alerts active'}</div>
                                        <div className="text-xs opacity-75 mt-0.5">Click to {alertsMuted ? 'enable' : 'mute'} alerts</div>
                                    </div>
                                }>
                                    <button
                                        className={`aa-topbar-chip flex items-center px-2 py-0.5 cursor-pointer ${alertsMuted ? 'text-muted-foreground' : ''}`}
                                        onClick={handleToggleMute}
                                        type="button"
                                    >
                                        {alertsMuted
                                            ? <icons.BellOff size={14} />
                                            : <icons.Bell    size={14} />
                                        }
                                    </button>
                                </Tooltip>

                                {/* Floating cog panel — appears on hover, reachable via pointer */}
                                {isAlertHovered && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 bg-background border rounded-lg flex gap-1 p-2 pointer-events-auto z-10"
                                        style={{ left: 'calc(100% + 4px)' }}
                                        onMouseEnter={handleAlertAreaEnter}
                                        onMouseLeave={handleAlertAreaLeave}
                                    >
                                        <button
                                            type="button"
                                            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => setIsSettingsOpen(true)}
                                            title="Alert settings"
                                        >
                                            <icons.Settings size={13} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                </div>
            </section>

            {settingsDialog}
        </>
    );
}
