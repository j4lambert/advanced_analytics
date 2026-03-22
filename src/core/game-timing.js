// ============================================================
// GameTiming — Game-time-aware interval scheduler
// ============================================================
// Polls getElapsedSeconds() every POLL_MS real milliseconds and fires
// registered callbacks whenever a configured number of game-seconds
// has elapsed.
//
// Unlike setInterval, this correctly tracks game speed (slow/normal/
// fast/ultrafast) because it measures game-time progression, not
// wall-clock time.
//
// Handles edge cases:
//   Pause    — elapsed freezes, so thresholds are never crossed.
//   Rewind   — detected when elapsed decreases (save loaded from an
//               earlier point); all lastFired values reset to current.
//   Drift    — lastFired advances by intervalSeconds (not by the
//               current elapsed), so cadence stays regular and never
//               accumulates drift over time.
//
// Usage:
//   import { gameTiming } from './game-timing.js';
//   gameTiming.init(api);
//   gameTiming.onEveryNGameSeconds(300, myCallback);  // every 5 game minutes
//   gameTiming.stop();
//   gameTiming.reset();
// ============================================================

const POLL_MS = 100;

let _api            = null;
let _interval       = null;
let _lastElapsed    = 0;
let _callbacks      = [];   // [{ intervalSeconds, lastFired, cb }]

// ── Core poll ──────────────────────────────────────────────────────────────

function _poll() {
    if (!_api) return;

    const current = _api.gameState.getElapsedSeconds();

    // Rewind detection: save loaded from an earlier point in time.
    // Reset all lastFired to current so we don't fire a flood of events.
    if (current < _lastElapsed) {
        for (const entry of _callbacks) {
            entry.lastFired = current;
        }
        _lastElapsed = current;
        return;
    }

    _lastElapsed = current;

    for (const entry of _callbacks) {
        if (current - entry.lastFired >= entry.intervalSeconds) {
            // Advance by intervalSeconds (not current) to keep cadence regular.
            entry.lastFired += entry.intervalSeconds;

            // Clamp: if we've somehow fallen more than one interval behind
            // (e.g. tab was backgrounded), skip ahead rather than firing
            // repeatedly in a burst.
            if (current - entry.lastFired >= entry.intervalSeconds) {
                entry.lastFired = current;
            }

            try {
                entry.cb();
            } catch (err) {
                console.error('[AA:TIMING] Callback error:', err);
            }
        }
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the polling interval.
 * Idempotent — safe to call multiple times; previous interval is cleared.
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function init(api) {
    _api = api;

    if (_interval) clearInterval(_interval);
    _lastElapsed = api.gameState.getElapsedSeconds();
    _interval = setInterval(_poll, POLL_MS);
}

/**
 * Stop the polling interval. Does not clear registered callbacks.
 */
export function stop() {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
}

/**
 * Clear all registered callbacks and reset elapsed tracking.
 * Call on game init/load before registering callbacks fresh.
 */
export function reset() {
    _callbacks   = [];
    _lastElapsed = 0;
}

/**
 * Register a callback to fire every `intervalSeconds` of game time.
 * Returns a handle that can be passed to `off()` to unregister.
 *
 * @param {number}   intervalSeconds - Game seconds between firings
 * @param {Function} cb              - Callback (no arguments)
 * @returns {Object} handle
 */
export function onEveryNGameSeconds(intervalSeconds, cb) {
    const entry = {
        intervalSeconds,
        lastFired: _lastElapsed,
        cb,
    };
    _callbacks.push(entry);
    return entry;
}

/**
 * Unregister a previously registered callback by handle.
 * @param {Object} handle - The value returned by onEveryNGameSeconds
 */
export function off(handle) {
    const idx = _callbacks.indexOf(handle);
    if (idx !== -1) _callbacks.splice(idx, 1);
}

export const gameTiming = { init, stop, reset, onEveryNGameSeconds, off };
