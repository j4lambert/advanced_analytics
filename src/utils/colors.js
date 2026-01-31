// Color utilities
// Helper functions for color/class selection

import { CONFIG } from '../config.js';

/**
 * Get utilization status classes based on percentage
 * @param {number} utilization - Utilization percentage
 * @returns {string} CSS color classes
 */
export function getUtilizationClasses(utilization) {
    const thresholds = CONFIG.UTILIZATION_THRESHOLDS;
    const colors = CONFIG.COLORS.UTILIZATION;
    
    if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
        return colors.CRITICAL;
    } else if ((utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW) || 
               (utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH)) {
        return colors.WARNING;
    }
    return colors.GOOD;
}

/**
 * Get color class for comparison value
 * @param {string} type - Comparison type ('new', 'deleted', 'normal', etc.)
 * @param {boolean} isImprovement - Whether change is positive
 * @returns {string} CSS color classes
 */
export function getComparisonColorClass(type, isImprovement) {
    if (type === 'new') return CONFIG.COLORS.COMPARE.NEW;
    if (type === 'deleted') return CONFIG.COLORS.COMPARE.DELETED;
    if (type === 'zero') return CONFIG.COLORS.COMPARE.NEUTRAL;
    
    return isImprovement 
        ? CONFIG.COLORS.COMPARE.POSITIVE 
        : CONFIG.COLORS.COMPARE.NEGATIVE;
}

/**
 * Get arrow character for comparison
 * @param {number} value - Comparison value
 * @returns {string} Arrow character
 */
export function getComparisonArrow(value) {
    if (value > 0) return CONFIG.ARROWS.UP;
    if (value < 0) return CONFIG.ARROWS.DOWN;
    return CONFIG.ARROWS.NEUTRAL;
}
