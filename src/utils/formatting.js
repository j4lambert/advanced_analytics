// Formatting utilities
// Pure functions for data formatting

/**
 * Format a number as currency with proper decimals
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted currency string (e.g., "$1,234" or "$1.23")
 */
export function formatCurrency(value, decimals = 0) {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    const sign = value < 0 ? '-' : '';
    return `${sign}$${formatted}`;
}

/**
 * Format day label with "Yesterday" indicator
 * @param {number} day - Day number
 * @param {number} mostRecentDay - Most recent day in history
 * @returns {string} Formatted label
 */
export function formatDayLabel(day, mostRecentDay) {
    return day === mostRecentDay ? `Day ${day} (Yesterday)` : `Day ${day}`;
}

/**
 * Calculate total trains for a route
 * @param {Object} route - Route object with train schedule
 * @returns {number} Total number of trains
 */
export function calculateTotalTrains(route) {
    if (!route) return 0;
    return (route.trainsHigh || 0) + (route.trainsMedium || 0) + (route.trainsLow || 0);
}

/**
 * Get all available days from historical data (sorted newest to oldest)
 * @param {Object} historicalData - Historical data object with days property
 * @returns {number[]} Sorted array of day numbers
 */
export function getAvailableDays(historicalData) {
    return Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
}

/**
 * Check if route was new on a specific day
 * @param {string} routeId - Route ID
 * @param {number} day - Day to check
 * @param {Object} routeStatuses - Map of route statuses
 * @returns {boolean} True if route was new on this day
 */
export function wasRouteNewOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === 'ongoing' && status.createdDay === day;
}

/**
 * Check if route was deleted on a specific day
 * @param {string} routeId - Route ID
 * @param {number} day - Day to check
 * @param {Object} routeStatuses - Map of route statuses
 * @returns {boolean} True if route was deleted on this day
 */
export function wasRouteDeletedOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === 'deleted' && status.deletedDay === day;
}
