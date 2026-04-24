// Alerts Engine
// Polls every 5 s, evaluates user-defined threshold rules, fires toast notifications.
// Deduplication: one toast per rule×route per game-hour; persistent toasts block re-fire
// while still visible.

import { toast }                  from 'react-toastify';
import { notify }                 from '../../hooks/toast.js';
import { getRoute24hStats, getTrainsForRoute } from '../../metrics/accumulator.js';
import { computeSystemAggregates }             from '../../metrics/system-aggregates.js';
import { computeAdherenceSnapshot }            from '../../metrics/historical-data.js';
import { computeScheduleDrift }                from '../../metrics/timetable-metrics.js';
import { CONFIG }                              from '../../config.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const POLL_INTERVAL_MS = 5000;
const WARMUP_ELAPSED_SEC = 300;

// ── Module state (reset on each initAlertsEngine call) ────────────────────────

let _interval   = null;
let _muted      = false;
let _storage    = null;

// key: `${ruleId}:${targetKey}` → last game-hour a toast was fired
const _lastTriggeredHour = new Map();
// key: same → react-toastify toastId for persistent toasts
const _activeToastIds    = new Map();

// ── Public API ────────────────────────────────────────────────────────────────

export function initAlertsEngine(apiInstance, storage) {
    stopAlertsEngine();
    _storage = storage;
    _muted   = false;
    _lastTriggeredHour.clear();
    _activeToastIds.clear();
    _interval = setInterval(_poll, POLL_INTERVAL_MS);
}

export function stopAlertsEngine() {
    if (_interval !== null) {
        clearInterval(_interval);
        _interval = null;
    }
}

export function setAlertsMuted(muted) {
    _muted = muted;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _formatValue(metric, value) {
    switch (metric) {
        case 'performance':        return value.toFixed(2) + '×';
        case 'scheduleDrift':      return _fmtSec(value);
        default:                   return Math.round(value) + '%';
    }
}

function _fmtSec(sec) {
    const s = Math.round(Math.abs(sec));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? m + 'm' : m + 'm ' + r + 's';
}

function _metricLabel(metric) {
    switch (metric) {
        case 'loadFactor':         return 'Load Factor';
        case 'performance':        return 'Performance';
        case 'scheduleDrift':      return 'Schedule Drift';
        case 'systemHealth':       return 'Health Score';
        case 'timetableAdherence': return 'Timetable Adherence';
        default:                   return metric;
    }
}

function _fetchMetric(metric, routeId, routes) {
    if (routeId === null) {
        // System target
        const routeStats = routes.map(r => ({ ...getRoute24hStats(r.id), id: r.id }));
        const agg = computeSystemAggregates(routeStats);
        if (metric === 'timetableAdherence') {
            return computeAdherenceSnapshot(api).systemAdherenceScore;
        }
        if (metric === 'systemHealth') return agg.healthScore;
        return agg.loadFactor;
    }
    // Route target
    const stats = getRoute24hStats(routeId);
    if (metric === 'scheduleDrift') {
        return computeScheduleDrift(getTrainsForRoute(routeId)).meanDriftSec;
    }
    if (metric === 'performance') return stats.efficiency;
    return stats.loadFactor;
}

function _conditionMet(trigger, value, refValue) {
    return trigger === 'lt' ? value < refValue : value > refValue;
}

function _navigate(metric, routeId) {
    if (routeId !== null) {
        window.AdvancedAnalytics?.openRouteDialog?.(routeId);
    } else if (metric === 'timetableAdherence') {
        window.AdvancedAnalytics?.openTimetableDialog?.();
    } else {
        window.AdvancedAnalytics?.openDialog?.();
    }
}

function _resolveTargets(rule, routes) {
    if (rule.target === 'system')    return [null];
    if (rule.target === 'any-route') return routes.map(r => r.id);
    return [rule.target];
}

function _inlineBadge(routeId, routes) {
    const route = routes.find(r => r.id === routeId);
    if (!route) return null;
    const radius = route.shape === 'circle' ? '50%' : '4px';
    return React.createElement('span', {
        title: route.name,
        onClick: () => window.AdvancedAnalytics?.openRouteDialog?.(routeId),
        style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '1.2rem', height: '1.2rem', minWidth: '1.2rem',
            borderRadius: radius,
            backgroundColor: route.color,
            color: route.textColor ?? '#fff',
            fontSize: '0.6rem', fontWeight: 'bold', cursor: 'pointer',
        },
    }, route.bullet);
}

function _fireToast(rule, routeId, value, routes) {
    const label    = _metricLabel(rule.metric);
    const fmtVal   = _formatValue(rule.metric, value);
    const trigWord = rule.trigger === 'lt' ? 'below' : 'above';
    const fmtRef   = _formatValue(rule.metric, rule.refValue);

    const key = `${rule.id}:${routeId ?? 'system'}`;

    const headlineEl = routeId !== null
        ? React.createElement('div', { className: 'font-semibold text-sm flex items-center gap-1.5 mb-2' },
            _inlineBadge(routeId, routes),
            React.createElement('span', null, label),
          )
        : React.createElement('div', { className: 'font-semibold text-sm' }, `System: ${label}`);

    const content = React.createElement('div', null,
        headlineEl,
        React.createElement('div', { className: 'text-sm text-muted-foreground mt-0.5 flex items-center gap-1' },
            React.createElement('span', {className: 'text-primary'}, trigWord),
            React.createElement('span', {className: 'text-primary font-bold'}, fmtRef),
            `· now`,
            React.createElement('span', {className: 'text-primary font-bold'}, fmtVal),
            React.createElement('span', null, ' · '),
            React.createElement('button', {
                className: 'underline cursor-pointer text-primary/80 hover:text-primary',
                onClick: () => _navigate(rule.metric, routeId),
            }, 'See more'),
        ),
    );

    return notify(content, {
        toastId:   key,
        autoClose: rule.persistent ? false : 8000,
    });
}

// ── Main poll ─────────────────────────────────────────────────────────────────

async function _poll() {
    try {
        if (_muted || !_storage) return;

        const elapsedSec = api.gameState.getElapsedSeconds?.() ?? 0;
        if (elapsedSec < WARMUP_ELAPSED_SEC) return;

        const currentGameHour = Math.floor(elapsedSec / 3600);

        const rules  = await _storage.get('alertRules', []);
        if (!rules || rules.length === 0) return;

        const routes = api.gameState.getRoutes() ?? [];

        for (const rule of rules) {
            const targets = _resolveTargets(rule, routes);

            for (const routeId of targets) {
                // Guard: skip rules targeting a routeId that no longer exists
                if (routeId !== null && !routes.some(r => r.id === routeId)) continue;

                let value;
                try {
                    value = _fetchMetric(rule.metric, routeId, routes);
                } catch {
                    continue;
                }

                // Null / zero guard (startup or uncomputed metric)
                if (value == null || value === 0) continue;

                if (!_conditionMet(rule.trigger, value, rule.refValue)) continue;

                const key = `${rule.id}:${routeId ?? 'system'}`;

                // Persistent toast still on screen → skip
                if (_activeToastIds.has(key) && toast.isActive(_activeToastIds.get(key))) continue;

                // Same game-hour already triggered → skip
                if (_lastTriggeredHour.get(key) === currentGameHour) continue;

                _lastTriggeredHour.set(key, currentGameHour);
                const toastId = _fireToast(rule, routeId, value, routes);
                _activeToastIds.set(key, toastId);

                if (rule.pauseGame) {
                    try { api.actions.setPause(true); } catch { /* ignore if API unavailable */ }
                }
            }
        }
    } catch (e) {
        console.warn(`${CONFIG.LOG_PREFIX} alerts engine poll error:`, e);
    }
}
