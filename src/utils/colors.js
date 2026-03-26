// Color utilities
// Helper functions for color/class selection

import { CONFIG } from '../config.js';

/**
 * Get load factor status classes based on percentage (0–100+)
 * @param {number} loadFactor - Load factor percentage
 * @returns {string} CSS color classes
 */
export function getLoadFactorClasses(loadFactor) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.LOAD_FACTOR_THRESHOLDS;
    const colors = CONFIG.COLORS.EFFICIENCY; // same 3-class palette

    if (loadFactor < CRITICAL_LOW || loadFactor > CRITICAL_HIGH) return colors.CRITICAL;
    if (loadFactor < WARNING_LOW  || loadFactor > WARNING_HIGH)  return colors.WARNING;
    return colors.GOOD;
}

/**
 * Get efficiency status classes based on multiplier value (e.g. 1.3 = 1.3×)
 * @param {number} efficiency - Efficiency multiplier (ridership / 2× capacity)
 * @returns {string} CSS color classes
 */
export function getEfficiencyClasses(efficiency) {
    const { CRITICAL_LOW, WARNING_LOW } = CONFIG.EFFICIENCY_THRESHOLDS;
    const colors = CONFIG.COLORS.EFFICIENCY;

    if (efficiency < CRITICAL_LOW) return colors.CRITICAL;
    if (efficiency < WARNING_LOW)  return colors.WARNING;
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
