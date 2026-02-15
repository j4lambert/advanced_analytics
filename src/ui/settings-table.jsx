// SettingsTable component
// Generic table for settings management with selection and sorting

import { CONFIG } from '../config.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * SettingsTable Component
 * 
 * @param {Object} props
 * @param {Array} props.data - Table data array
 * @param {Array} props.columns - Column definitions [{key, label, align, render}]
 * @param {Array} props.selectedIds - Array of selected row IDs
 * @param {function} props.onSelectionChange - Callback when selection changes
 * @param {string} props.currentId - ID of current/active row to highlight
 */
export function SettingsTable({ 
    data = [], 
    columns = [],
    selectedIds = [],
    onSelectionChange = () => {},
    currentId = null
}) {
    const [sortState, setSortState] = React.useState({ column: null, order: 'desc' });
    
    // Handle "select all" checkbox
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all rows
            onSelectionChange(data.map(row => row.id));
        } else {
            // Deselect all
            onSelectionChange([]);
        }
    };
    
    // Handle individual row checkbox
    const handleSelectRow = (rowId) => {
        if (selectedIds.includes(rowId)) {
            // Deselect
            onSelectionChange(selectedIds.filter(id => id !== rowId));
        } else {
            // Select
            onSelectionChange([...selectedIds, rowId]);
        }
    };
    
    // Handle column sort
    const handleSort = (columnKey) => {
        setSortState(prev => ({
            column: columnKey,
            order: prev.column === columnKey && prev.order === 'desc' ? 'asc' : 'desc'
        }));
    };
    
    // Sort data
    const sortedData = React.useMemo(() => {
        if (!sortState.column) return data;
        
        return [...data].sort((a, b) => {
            const aVal = a[sortState.column];
            const bVal = b[sortState.column];
            
            // Handle different types
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortState.order === 'desc' 
                    ? bVal.localeCompare(aVal)
                    : aVal.localeCompare(bVal);
            }
            
            // Numeric comparison
            return sortState.order === 'desc' ? bVal - aVal : aVal - bVal;
        });
    }, [data, sortState]);
    
    // Get sort indicator
    const getSortIndicator = (columnKey) => {
        if (sortState.column !== columnKey) {
            return CONFIG.ARROWS.DOWN;
        }
        return sortState.order === 'desc' ? CONFIG.ARROWS.DOWN : CONFIG.ARROWS.UP;
    };
    
    const allSelected = data.length > 0 && selectedIds.length === data.length;
    const someSelected = selectedIds.length > 0 && selectedIds.length < data.length;
    
    return (
        <table className="w-full border-collapse text-sm">
            <thead>
                <tr className="border-b border-border">
                    {/* Checkbox column */}
                    <th className="px-3 py-2 text-left w-10">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            ref={input => {
                                if (input) {
                                    input.indeterminate = someSelected;
                                }
                            }}
                            onChange={handleSelectAll}
                            className="cursor-pointer"
                            title="Select all"
                        />
                    </th>
                    
                    {/* Data columns */}
                    {columns.map(column => {
                        const alignClass = column.align === 'right' ? 'text-right' : 
                                         column.align === 'center' ? 'text-center' : 'text-left';
                        const isActiveSort = sortState.column === column.key;
                        
                        return (
                            <th 
                                key={column.key}
                                className={`px-3 py-2 ${alignClass} ${column.sortable !== false ? 'cursor-pointer select-none' : ''} transition-colors hover:text-foreground`}
                                onClick={column.sortable !== false ? () => handleSort(column.key) : undefined}
                            >
                                <div className={`flex ${column.align === 'right' ? 'justify-end' : 'justify-start'} items-center gap-1 whitespace-nowrap`}>
                                    {column.sortable !== false && (
                                        <span className={isActiveSort ? 'inline-block' : 'inline-block opacity-0'}>
                                            {getSortIndicator(column.key)}
                                        </span>
                                    )}
                                    <span className="font-medium text-xs">{column.label}</span>
                                </div>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody className="text-xs">
                {sortedData.map(row => {
                    const isSelected = selectedIds.includes(row.id);
                    const isCurrent = currentId === row.id;
                    
                    return (
                        <tr 
                            key={row.id}
                            className={`border-b border-border transition-colors ${
                                isCurrent 
                                    ? 'bg-primary/10 hover:bg-primary/15' 
                                    : 'hover:bg-muted/50'
                            }`}
                        >
                            {/* Checkbox */}
                            <td className="px-3 py-2 align-middle">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleSelectRow(row.id)}
                                    className="cursor-pointer"
                                />
                            </td>
                            
                            {/* Data cells */}
                            {columns.map(column => {
                                const alignClass = column.align === 'right' ? 'text-right' : 
                                                 column.align === 'center' ? 'text-center' : 'text-left';
                                const value = row[column.key];
                                const displayValue = column.render 
                                    ? column.render(value, row) 
                                    : value;
                                
                                return (
                                    <td 
                                        key={column.key}
                                        className={`px-4 py-2 align-middle ${alignClass} ${isCurrent ? 'font-bold' : ''}`}
                                    >
                                        {displayValue}
                                        {isCurrent && column.key === 'name' && (
                                            <span className="ml-2 text-blue-500">(current)</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
                
                {/* Empty state */}
                {sortedData.length === 0 && (
                    <tr>
                        <td 
                            colSpan={columns.length + 1} 
                            className="px-3 py-8 text-center text-muted-foreground"
                        >
                            No data available
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
