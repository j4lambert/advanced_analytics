// Network-wide aggregate metrics — shared computation used by both the
// SystemStats dashboard component and the getNetworkMetrics() public API.
//
// All functions are pure (no API calls, no React). They operate on arrays of
// per-route stat objects that match the shape returned by getRoute24hStats().
//
// ── LOAD FACTOR ─────────────────────────────────────────────────────────────
//   Each route's loadFactor is already in the 0–100 (%) range.
//   The network figure is a ridership-weighted average, so heavily-ridden
//   routes count more than lightly-used ones.
//
// ── HEALTH SCORE ────────────────────────────────────────────────────────────
//   Ridership-weighted average of a per-route quality score that rewards
//   load factor in the 40–80% sweet spot and penalises both waste and
//   crowding (same formula as the SystemStats semi-circle gauge):
//
//     score(u) = 0                u ≤ 20%
//              = (u-20)/20 × 0.5   20 < u ≤ 40%
//              = 1.0               40 < u ≤ 80%
//              = 1 - (u-80)/15×0.3 80 < u ≤ 95%
//              = 0.7-(u-95)/25×0.7 95 < u ≤ 120%
//              = 0                 u > 120%
//
//   Network Health Score = Σ(ridership_i × score_i) / Σridership_i × 100  (0–100)

/**
 * Per-route health quality score.
 *
 * @param {number} loadFactor  Route load factor in % (0–100+)
 * @returns {number}           Quality score in [0, 1]
 */
export function routeHealthScore(loadFactor) {
    const u = loadFactor ?? 0;
    if (u <= 20)  return 0;
    if (u <= 40)  return ((u - 20) / 20) * 0.5;
    if (u <= 80)  return 1.0;
    if (u <= 95)  return 1.0 - ((u - 80) / 15) * 0.3;
    if (u <= 120) return 0.7 - ((u - 95) / 25) * 0.7;
    return 0;
}

/**
 * Aggregate per-route stats into network-wide metrics.
 *
 * Accepts any array of objects that have the fields produced by
 * getRoute24hStats() (optionally spread together with route metadata
 * such as `id`, `name`, `deleted`). Deleted routes are silently excluded.
 *
 * @param {Object[]} routeStats  Per-route data (may include deleted entries)
 * @returns {{
 *   totalLines:      number,
 *   totalTrains:     number,
 *   totalRidership:  number,
 *   totalRevenue:    number,
 *   totalCost:       number,
 *   totalProfit:     number,
 *   totalCapacity:   number,
 *   totalEfficiency: number,   // 0–1 fraction (ridership / 2*capacity)
 *   loadFactor:      number,   // ridership-weighted, 0–100 %
 *   healthScore:     number,   // ridership-weighted quality, 0–100
 * }}
 */
export function computeSystemAggregates(routeStats) {
    const routes = (routeStats ?? []).filter(r => !r.deleted);
    const n = routes.length;

    if (n === 0) {
        return {
            totalLines:      0,
            totalTrains:     0,
            totalRidership:  0,
            totalRevenue:    0,
            totalCost:       0,
            totalProfit:     0,
            totalCapacity:   0,
            totalEfficiency: 0,
            loadFactor:      0,
            healthScore:     0,
        };
    }

    const totalTrains    = routes.reduce((s, r) => s + (r.totalTrains    ?? 0), 0);
    const totalRevenue   = routes.reduce((s, r) => s + (r.dailyRevenue   ?? 0), 0);
    const totalCost      = routes.reduce((s, r) => s + (r.dailyCost      ?? 0), 0);
    const totalProfit    = routes.reduce((s, r) => s + (r.dailyProfit    ?? 0), 0);
    const totalRidership = routes.reduce((s, r) => s + (r.ridership      ?? 0), 0);
    const totalCapacity  = routes.reduce((s, r) => s + (r.capacity       ?? 0), 0);

    const totalEfficiency = totalCapacity > 0 ? totalRidership / (2 * totalCapacity) : 0;

    // Ridership-weighted average: routes with more riders anchor the figure
    const loadFactor = totalRidership > 0
        ? routes.reduce((s, r) => s + (r.ridership ?? 0) * (r.loadFactor ?? 0), 0) / totalRidership
        : 0;

    const healthScore = totalRidership > 0
        ? routes.reduce((s, r) =>
            s + (r.ridership ?? 0) * routeHealthScore(r.loadFactor ?? 0)
          , 0) / totalRidership * 100
        : 0;

    return {
        totalLines:      n,
        totalTrains,
        totalRidership,
        totalRevenue,
        totalCost,
        totalProfit,
        totalCapacity,
        totalEfficiency,
        loadFactor,
        healthScore,
    };
}
