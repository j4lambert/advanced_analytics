// ============================================================
// Accumulator — Event-Log Based Revenue + Cost (Production Module)
// ============================================================
// Replaces the hourly-bucket system with a rolling event log.
//
// Revenue and cost money-change events are stored with per-route
// proportional weights captured at event time.  This allows querying
// a TRUE rolling 24-hour window without any day-boundary resets.
//
// Key public functions:
//   getRoute24hStats(routeId)              — rolling last-24h stats
//   getRouteTodayStats(routeId)            — current day stats (trend chart "Today")
//   initAccumulator(api)                   — start poll + register money hook (idempotent)
//   stopAccumulating()                     — stop poll/prune intervals
//   clearAccumulatorState()                — wipe all events (call before restoreEvents)
//   persistEvents(storage)                 — save event log to IDB
//   restoreEvents(storage, currentElapsed) — load + prune stale events from IDB
//
// Architecture:
//   onMoneyChanged       → append { t, amount, weights } to _revEvents / _costEvents
//   poll (500ms wall)    → update _lastRevWeights, _lastCostWeights, refresh caches
//   prune (60s wall)     → drop events older than 24 h + grace period
//   gameTiming (5 game min) → refresh _transfersCache + _segmentLoadsCache
//                             scales correctly with game speed (fast/ultrafast)
//
// Capacity:
//   Static full-day throughput ceiling — same formula as calculateRouteMetrics.
//   Stable throughout the day; only changes when the train schedule or loop
//   time changes.  No rolling window, no prorating for new routes.
//
// Weight carry-forward (tail-lag defence):
//   revenuePerHour oscillates near 0 between game engine pulses.  We track
//   per-route proportions normalised from the last non-zero rate snapshot.
//   When all rates are 0, _buildWeights returns the previous proportions so
//   money events during the quiet period are still attributed correctly.
//
// Singleton — onMoneyChanged is registered exactly once per page lifetime.
// ============================================================

import { CONFIG } from '../config.js';
import { calculateTransfers } from './transfers.js';
import { getRouteStationsInOrder, isCircularRoute, computeMaxSegmentLoadFraction } from '../utils/route-utils.js';
import { gameTiming } from '../core/game-timing.js';

const TAG                        = '[AA:ACC]';
const POLL_INTERVAL_MS           = 500;
const PRUNE_INTERVAL_MS          = 60_000;
const CACHES_REFRESH_GAME_SEC    = 300;  // refresh transfers/loads every 5 game minutes
const GRACE_SECONDS              = 300;  // keep 5 min extra past the 24 h cutoff
const PERSIST_KEY         = 'accumulatorEvents';

// ── Module-level state ─────────────────────────────────────────────────────

let _hookRegistered  = false;
let _api             = null;

// Event logs
let _revEvents    = []; // { t: elapsedSec, amount: number, weights: { routeId: proportion } }
let _costEvents   = []; // same shape

// Weight carry-forward (non-zero proportions, kept across tail-lag periods)
let _lastRevWeights  = {}; // routeId → proportion  (values sum to 1)
let _lastCostWeights = {}; // routeId → proportion  (values sum to 1)

// Poll-refreshed caches
let _routesCache        = null; // current routes array
let _trainTypesCache    = null; // { trainTypeId: trainType }
let _transfersCache     = null; // { routeId: { count, routes, routeIds, stationIds } }
let _segmentLoadsCache  = {};   // { routeId: maxLoadPerDirection }

// Per-hour ridership tracking (sampled from ridersPerHour in _refreshCaches)
let _ridershipHourly = {};  // { routeId: number[24] } — average ridersPerHour for each game hour
let _ridershipAccum  = {};  // { routeId: { hour, sum, count } } — in-progress accumulator for current game hour

// Timers
let _pollTimer  = null;
let _pruneTimer = null;

// ── Helper: empty stats shape ──────────────────────────────────────────────

function _emptyStats() {
    return {
        dailyRevenue:       0,
        dailyCost:          0,
        dailyProfit:        0,
        ridership:          0,
        capacity:           0,
        utilization:        0,
        efficiency:         0,
        loadFactor:         0,
        loadFactorHigh:     0,
        loadFactorMedium:   0,
        loadFactorLow:      0,
        stations:           0,
        transfers:          { count: 0, routes: [], routeIds: [], stationIds: [] },
        trainsHigh:         0,
        trainsMedium:       0,
        trainsLow:          0,
        trainSchedule:      0,
        totalTrains:        0,
        profitPerTrain:     0,
    };
}

// ── Helper: formula-based cost rates per route ─────────────────────────────

function _computeCostRates(elapsedSeconds, routes) {
    if (!_api) return {};

    const currentHour = Math.floor((elapsedSeconds % 86400) / 3600);
    const phase = CONFIG.DEMAND_PHASES.find(
        p => currentHour >= p.startHour && currentHour < p.endHour
    ) || CONFIG.DEMAND_PHASES[0];
    const demandType = phase.type;

    const trainTypes = _api.trains.getTrainTypes();
    const rates = {};

    routes.forEach(route => {
        const trainType = trainTypes[route.trainType];
        if (!trainType || !route.trainSchedule || !route.stComboTimings?.length) {
            rates[route.id] = 0;
            return;
        }

        const carsPerTrain = route.carsPerTrain !== undefined
            ? route.carsPerTrain
            : trainType.stats.carsPerCarSet;

        const trainCostPerHour    = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const carCostPerHour      = trainType.stats.carOperationalCostPerHour   * CONFIG.COST_MULTIPLIER;
        const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

        const trainCounts = {
            high:   route.trainSchedule.highDemand   || 0,
            medium: route.trainSchedule.mediumDemand || 0,
            low:    route.trainSchedule.lowDemand    || 0,
        };

        rates[route.id] = (trainCounts[demandType] || 0) * costPerTrainPerHour;
    });

    return rates;
}

// ── Helper: build normalised weight map ────────────────────────────────────

/**
 * Convert a { routeId: rate } map to { routeId: proportion } (sum = 1).
 * Returns prevWeights unchanged when total rate is zero (carry-forward).
 */
function _buildWeights(rates, prevWeights) {
    let total = 0;
    for (const r of Object.values(rates)) total += r;
    if (total === 0) return prevWeights; // tail-lag carry-forward

    const weights = {};
    for (const [id, r] of Object.entries(rates)) {
        if (r > 0) weights[id] = r / total;
    }
    return weights;
}

// ── Helper: phase-hour index map (built once from CONFIG) ─────────────────

let _phaseHours = null; // { high: number[], medium: number[], low: number[] }

function _getPhaseHours() {
    if (_phaseHours) return _phaseHours;
    const map = { high: [], medium: [], low: [] };
    for (const phase of CONFIG.DEMAND_PHASES) {
        for (let h = phase.startHour; h < phase.endHour; h++) {
            map[phase.type].push(h);
        }
    }
    _phaseHours = map;
    return _phaseHours;
}

// ── Helper: per-phase capacities ──────────────────────────────────────────

function _computePhaseCapacities(route, trainType) {
    if (!route.stComboTimings?.length) return { high: 0, medium: 0, low: 0 };
    const timings     = route.stComboTimings;
    const loopTimeSec = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
    if (loopTimeSec <= 0) return { high: 0, medium: 0, low: 0 };
    const loopsPerHour     = 3600 / loopTimeSec;
    const carsPerTrain     = route.carsPerTrain ?? trainType.stats.carsPerCarSet;
    const capacityPerTrain = carsPerTrain * trainType.stats.capacityPerCar;
    const counts = {
        high:   route.trainSchedule?.highDemand   || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low:    route.trainSchedule?.lowDemand    || 0,
    };
    return {
        high:   Math.round(counts.high   * CONFIG.DEMAND_HOURS.high   * loopsPerHour * capacityPerTrain),
        medium: Math.round(counts.medium * CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain),
        low:    Math.round(counts.low    * CONFIG.DEMAND_HOURS.low    * loopsPerHour * capacityPerTrain),
    };
}

// ── Helper: static full-day capacity ──────────────────────────────────────

/**
 * Maximum passengers the route can carry across a full 24-hour day.
 *
 * Uses the fixed demand-hour totals from CONFIG (6 h high, 9 h medium, 9 h low)
 * and the current train schedule — identical to calculateRouteMetrics.
 *
 * This value is stable throughout the day and only changes when the player
 * edits the train schedule or the route's loop time changes.
 *
 * @param {Object} route     - Route object (current game state)
 * @param {Object} trainType - Train type definition
 * @returns {number} Rounded passenger capacity
 */
function _computeStaticCapacity(route, trainType) {
    if (!route.stComboTimings?.length) return 0;

    const timings     = route.stComboTimings;
    const loopTimeSec = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
    if (loopTimeSec <= 0) return 0;

    const loopsPerHour = 3600 / loopTimeSec;
    const carsPerTrain = route.carsPerTrain !== undefined
        ? route.carsPerTrain
        : trainType.stats.carsPerCarSet;
    const capacityPerTrain = carsPerTrain * trainType.stats.capacityPerCar;

    const trainCounts = {
        high:   route.trainSchedule?.highDemand   || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low:    route.trainSchedule?.lowDemand    || 0,
    };

    return Math.round(
        (trainCounts.high   * CONFIG.DEMAND_HOURS.high   +
         trainCounts.medium * CONFIG.DEMAND_HOURS.medium +
         trainCounts.low    * CONFIG.DEMAND_HOURS.low)
        * loopsPerHour * capacityPerTrain
    );
}

// ── Core stats computation ─────────────────────────────────────────────────

/**
 * Aggregate revenue, cost, capacity, and live data for a route
 * over the given elapsed-seconds window [cutoff, now].
 */
function _computeStatsForWindow(routeId, cutoff, now) {
    if (!_api) return _emptyStats();

    // ── Revenue from event log ──────────────────────────────────────────
    let revenue = 0;
    for (const ev of _revEvents) {
        if (ev.t < cutoff || ev.t > now) continue;
        const w = ev.weights[routeId];
        if (w > 0) revenue += ev.amount * w;
    }

    // ── Cost from event log ─────────────────────────────────────────────
    let cost = 0;
    for (const ev of _costEvents) {
        if (ev.t < cutoff || ev.t > now) continue;
        const w = ev.weights[routeId];
        if (w > 0) cost += ev.amount * w;
    }

    // ── Live data from caches / API ─────────────────────────────────────
    const route     = _routesCache?.find(r => r.id === routeId);
    const ridership = _api.gameState.getRouteRidership(routeId).total;
    const transfers = _transfersCache?.[routeId]
        ?? { count: 0, routes: [], routeIds: [], stationIds: [] };

    if (!route) {
        return { ..._emptyStats(), dailyRevenue: revenue, dailyCost: cost,
                 dailyProfit: revenue - cost, ridership, transfers };
    }

    const trainType = _trainTypesCache?.[route.trainType];
    const trainCounts = {
        high:   route.trainSchedule?.highDemand   || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low:    route.trainSchedule?.lowDemand    || 0,
    };
    const totalTrains = trainCounts.high + trainCounts.medium + trainCounts.low;
    const stations    = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;

    let capacity         = 0;
    let utilization      = 0;
    let efficiency       = 0;
    let loadFactor       = 0;
    let loadFactorHigh   = 0;
    let loadFactorMedium = 0;
    let loadFactorLow    = 0;

    if (trainType) {
        capacity    = _computeStaticCapacity(route, trainType);
        utilization = capacity > 0 ? Math.round((ridership / capacity) * 100) : 0;
        efficiency  = capacity > 0 ? ridership / (2 * capacity) : 0;

        // loadFactor = (fraction of ridership on the busiest segment) × utilization
        // The fraction is scale-invariant (normalises cumulative commute counts).
        const maxSegmentFraction = _segmentLoadsCache[routeId] ?? 0;
        loadFactor = capacity > 0 && maxSegmentFraction > 0
            ? Math.round(maxSegmentFraction * (ridership / capacity) * 100)
            : 0;

        const hourly = _ridershipHourly[routeId];
        if (maxSegmentFraction > 0 && ridership > 0 && hourly) {
            const ph     = _getPhaseHours();
            const counts = {
                high:   route.trainSchedule?.highDemand   || 0,
                medium: route.trainSchedule?.mediumDemand || 0,
                low:    route.trainSchedule?.lowDemand    || 0,
            };
            const sumHours = (hours) => hours.reduce((s, h) => s + (hourly[h] || 0), 0);
            // Mask out phases with no trains: ridersPerHour reflects game demand regardless
            // of supply, so hours with 0 scheduled trains must not dilute the distribution.
            const rHigh   = counts.high   > 0 ? sumHours(ph.high)   : 0;
            const rMedium = counts.medium > 0 ? sumHours(ph.medium) : 0;
            const rLow    = counts.low    > 0 ? sumHours(ph.low)    : 0;
            const totalSampled = rHigh + rMedium + rLow;
            if (totalSampled > 0) {
                const pc = _computePhaseCapacities(route, trainType);
                // Use ridersPerHour as a distribution weight only — its unit is unknown,
                // but the relative proportions between phases reflect the true demand split.
                // Multiply by total ridership (24h) to derive absolute phase ridership.
                const pHigh   = ridership * rHigh   / totalSampled;
                const pMedium = ridership * rMedium / totalSampled;
                const pLow    = ridership * rLow    / totalSampled;
                if (pc.high   > 0) loadFactorHigh   = Math.round(maxSegmentFraction * pHigh   / pc.high   * 100);
                if (pc.medium > 0) loadFactorMedium = Math.round(maxSegmentFraction * pMedium / pc.medium * 100);
                if (pc.low    > 0) loadFactorLow    = Math.round(maxSegmentFraction * pLow    / pc.low    * 100);
            }
        }
    }

    const profit            = revenue - cost;
    const profitPerTrain     = totalTrains > 0 ? profit / totalTrains : 0;

    return {
        dailyRevenue:   revenue,
        dailyCost:      cost,
        dailyProfit:    profit,
        ridership,
        capacity,
        utilization,
        efficiency,
        loadFactor,
        loadFactorHigh,
        loadFactorMedium,
        loadFactorLow,
        stations,
        transfers,
        trainsHigh:     trainCounts.high,
        trainsMedium:   trainCounts.medium,
        trainsLow:      trainCounts.low,
        trainSchedule:  trainCounts.high,
        totalTrains,
        profitPerTrain,
    };
}

// ── Money hook ─────────────────────────────────────────────────────────────

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type, category) => {
        const t = api.gameState.getElapsedSeconds();

        if (type === 'revenue') {
            if (Object.keys(_lastRevWeights).length > 0) {
                _revEvents.push({ t, amount: change, weights: { ..._lastRevWeights } });
            }
        } else if (type === 'expense' && category === 'trainOperational') {
            if (Object.keys(_lastCostWeights).length > 0) {
                _costEvents.push({ t, amount: Math.abs(change), weights: { ..._lastCostWeights } });
            }
        }
    });
}

// ── Poll tick (wall-clock, 500 ms) ─────────────────────────────────────────
// Updates weight caches on every real-time tick so that onMoneyChanged
// events are always attributed with up-to-date per-route proportions.

function _tick() {
    if (!_api || _api.gameState.isPaused()) return;

    const elapsed     = _api.gameState.getElapsedSeconds();
    const routes      = _api.gameState.getRoutes();
    const lineMetrics = _api.gameState.getLineMetrics();

    // ── Revenue weights (carry-forward on tail-lag) ─────────────────────
    const revRates = {};
    lineMetrics.forEach(lm => { revRates[lm.routeId] = lm.revenuePerHour || 0; });
    _lastRevWeights = _buildWeights(revRates, _lastRevWeights);

    // ── Cost weights (formula-based, carry-forward on zero) ─────────────
    const costRates  = _computeCostRates(elapsed, routes);
    _lastCostWeights = _buildWeights(costRates, _lastCostWeights);

    // ── Refresh route/train-type caches ─────────────────────────────────
    _routesCache     = routes;
    _trainTypesCache = _api.trains.getTrainTypes();
}

// ── Cache refresh (game-time, every CACHES_REFRESH_GAME_SEC) ───────────────
// Refreshes expensive derived caches (transfers, segment loads) based on
// game-elapsed-seconds rather than wall-clock time, so the refresh cadence
// scales correctly with game speed (normal / fast / ultrafast).

function _refreshCaches() {
    if (!_api) return;

    const elapsed     = _api.gameState.getElapsedSeconds();
    const currentHour = Math.floor((elapsed % 86400) / 3600);
    const routes      = _routesCache ?? _api.gameState.getRoutes();

    // ── Per-hour ridership sampling ─────────────────────────────────────
    try {
        const lineMetrics = _api.gameState.getLineMetrics();
        lineMetrics.forEach(lm => {
            const id  = lm.routeId;
            const val = lm.ridersPerHour || 0;
            if (!_ridershipHourly[id]) _ridershipHourly[id] = new Array(24).fill(0);
            if (!_ridershipAccum[id])  _ridershipAccum[id]  = { hour: currentHour, sum: 0, count: 0 };
            const acc = _ridershipAccum[id];
            if (acc.hour !== currentHour) {
                const finalisedAvg = acc.count > 0 ? acc.sum / acc.count : 0;
                if (acc.count > 0) _ridershipHourly[id][acc.hour] = finalisedAvg;
                acc.hour  = currentHour;
                acc.sum   = 0;
                acc.count = 0;
            }
            acc.sum   += val;
            acc.count += 1;
        });
    } catch (e) {
        console.warn('[AA:hourly] sampling error', e);
    }

    try {
        _transfersCache = calculateTransfers(routes, _api);
    } catch (_) {
        // Non-critical — retain previous cache
    }

    try {
        const commutes    = _api.gameState.getCompletedCommutes?.() ?? [];
        const allStations = _api.gameState.getStations();
        const newLoads    = {};
        for (const route of routes) {
            const ordered    = getRouteStationsInOrder(route.id, _api);
            const orderedIds = ordered.map(s => s.id);
            const circular   = isCircularRoute(route, allStations);
            newLoads[route.id] = computeMaxSegmentLoadFraction(
                route.id, orderedIds, commutes, circular
            );
        }
        _segmentLoadsCache = newLoads;
    } catch (_) {
        // Non-critical — retain previous cache
    }
}

// ── Prune timer ────────────────────────────────────────────────────────────

function _pruneEvents() {
    if (!_api) return;
    const now    = _api.gameState.getElapsedSeconds();
    const cutoff = now - 86400 - GRACE_SECONDS;

    _revEvents  = _revEvents.filter(e => e.t >= cutoff);
    _costEvents = _costEvents.filter(e => e.t >= cutoff);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the accumulator. Safe to call multiple times — restarts timers
 * but does NOT reset state and does NOT re-register the money hook.
 *
 * Call from: onGameInit, onGameLoaded, handleMapReadyFallback
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initAccumulator(api) {
    _api = api;
    _registerMoneyHook(api);

    if (_pollTimer)  clearInterval(_pollTimer);
    if (_pruneTimer) clearInterval(_pruneTimer);

    _pollTimer  = setInterval(_tick,        POLL_INTERVAL_MS);
    _pruneTimer = setInterval(_pruneEvents, PRUNE_INTERVAL_MS);

    // Game-time-aware cache refresh — scales with game speed.
    gameTiming.init(api);
    gameTiming.onEveryNGameSeconds(CACHES_REFRESH_GAME_SEC, _refreshCaches);
}

/**
 * Stop poll and prune intervals.
 * The onMoneyChanged hook continues to fire (cannot be unregistered).
 *
 * Call from: onGameEnd
 */
export function stopAccumulating() {
    if (_pollTimer)  { clearInterval(_pollTimer);  _pollTimer  = null; }
    if (_pruneTimer) { clearInterval(_pruneTimer); _pruneTimer = null; }
    gameTiming.stop();
}

/**
 * Clear all event logs and weight/cache state.
 * Call BEFORE restoreEvents when loading a save, to discard stale in-memory data.
 */
export function clearAccumulatorState() {
    _revEvents         = [];
    _costEvents        = [];
    _lastRevWeights    = {};
    _lastCostWeights   = {};
    _routesCache       = null;
    _trainTypesCache   = null;
    _transfersCache    = null;
    _segmentLoadsCache = {};
    _ridershipHourly   = {};
    _ridershipAccum    = {};
    gameTiming.reset();
}

// ── Live rolling queries ───────────────────────────────────────────────────

/**
 * True rolling last-24 h stats for a route.
 *
 * Use for: dashboard table, route dialog stat cards.
 *
 * @param {string} routeId
 * @returns {Object} { dailyRevenue, dailyCost, dailyProfit, ridership,
 *                     capacity, utilization, stations, transfers,
 *                     trainsHigh, trainsMedium, trainsLow, trainSchedule,
 *                     totalTrains, profitPerTrain }
 */
export function getRoute24hStats(routeId) {
    if (!_api) return _emptyStats();
    const now    = _api.gameState.getElapsedSeconds();
    const cutoff = now - 86400;
    return _computeStatsForWindow(routeId, cutoff, now);
}

/**
 * Current calendar-day stats for a route (day start → now).
 *
 * Use for: route-metrics trend chart "Today" data point.
 *
 * @param {string} routeId
 * @returns {Object} Same shape as getRoute24hStats
 */
export function getRouteTodayStats(routeId) {
    if (!_api) return _emptyStats();
    const now      = _api.gameState.getElapsedSeconds();
    const dayStart = Math.floor(now / 86400) * 86400;
    return _computeStatsForWindow(routeId, dayStart, now);
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist the current event log to IDB.
 * Call from: onDayChange (before historical capture), onGameSaved.
 *
 * @param {Object} storage - Storage instance
 */
export async function persistEvents(storage) {
    if (!storage) return;
    try {
        await storage.set(PERSIST_KEY, {
            revEvents:       _revEvents,
            costEvents:      _costEvents,
            ridershipHourly: _ridershipHourly,
        });
    } catch (e) {
        console.error(`${TAG} Failed to persist events:`, e);
    }
}

/**
 * Load event log from IDB and prune:
 *   • events in the future relative to currentElapsed (handles save rewinding)
 *   • events older than 24 h + grace period
 *
 * Call AFTER clearAccumulatorState() on game load/reload.
 *
 * @param {Object} storage        - Storage instance
 * @param {number} currentElapsed - Current in-game elapsed seconds
 */
export async function restoreEvents(storage, currentElapsed) {
    if (!storage) return;
    try {
        const saved = await storage.get(PERSIST_KEY, null);
        if (!saved) {
            return;
        }

        const cutoff = currentElapsed - 86400 - GRACE_SECONDS;

        // Keep only events in [cutoff, currentElapsed]
        _revEvents  = (saved.revEvents  || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);
        _costEvents = (saved.costEvents || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);

        // Restore per-hour ridership distribution (no pruning needed — it's a fixed 24-slot array per route)
        if (saved.ridershipHourly) _ridershipHourly = saved.ridershipHourly;
    } catch (e) {
        console.error(`${TAG} Failed to restore events:`, e);
    }
}
