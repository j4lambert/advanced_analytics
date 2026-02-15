// Toolbar component
// Top toolbar with filters, timeframe selection, and compare mode

import { CONFIG } from '../config.js';
import { formatDayLabel, getAvailableDays } from '../utils/formatting.js';
import { Dropdown } from './dropdown.jsx';
import { DropdownItem } from './dropdown-item.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function Toolbar({
    groupState,
    onGroupChange,
    timeframeState,
    onTimeframeChange,
    compareMode,
    onCompareModeChange,
    comparePrimaryDay,
    onComparePrimaryDayChange,
    compareSecondaryDay,
    onCompareSecondaryDayChange,
    compareShowPercentages,
    onCompareShowPercentagesChange,
    historicalData
}) {
    const btnBaseClasses = 'whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border';
    const btnClasses = 'bg-background hover:bg-accent hover:text-accent-foreground border-input';
    const btnActiveClasses = 'bg-primary text-primary-foreground border-primary hover:bg-primary/90';
    const btnTogglerClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input';
    
    const allDays = getAvailableDays(historicalData);
    const mostRecentDay = allDays[0];
    const availableDays = allDays.filter(day => day < mostRecentDay);
    const hasOtherDays = availableDays.length > 0;
    
    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 gap-8">
            {/* Left side - Filter buttons */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium mr-1">Metrics:</span>
                
                <button
                    className={`${btnBaseClasses} ${groupState.trains ? btnActiveClasses : btnClasses}`}
                    onClick={() => onGroupChange('trains')}
                    title="Toggle Train Metrics"
                >
                    <icons.Train size={14} />
                    <span>Trains</span>
                </button>
                
                <button
                    className={`${btnBaseClasses} ${groupState.finance ? btnActiveClasses : btnClasses}`}
                    onClick={() => onGroupChange('finance')}
                    title="Toggle Finance Metrics"
                >
                    <icons.DollarSign size={14} />
                    <span>Finance</span>
                </button>
            </div>
            <span className="max-w-4xl w-full"/>
            
            {/* Middle - Timeframe selection */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium mr-1">Show:</span>
                
                {!compareMode ? (
                    <>
                        {/* Last 24h button */}
                        <button
                            className={`${btnBaseClasses} ${timeframeState === 'last24h' ? btnActiveClasses : btnClasses}`}
                            onClick={() => onTimeframeChange('last24h')}
                            title="Show data from last 24 hours"
                        >
                            <icons.Clock size={14} />
                            <span>Last 24h</span>
                        </button>
                        
                        {/* Yesterday button */}
                        <button
                            className={`${btnBaseClasses} ${!mostRecentDay ? 'opacity-50 cursor-not-allowed' : ''} ${timeframeState === String(mostRecentDay) ? btnActiveClasses : btnClasses}`}
                            onClick={mostRecentDay ? () => onTimeframeChange(String(mostRecentDay)) : undefined}
                            disabled={!mostRecentDay}
                            title={mostRecentDay ? `Show data from Day ${mostRecentDay}` : 'No data available'}
                        >
                            <icons.Calendar size={14} />
                            <span>{mostRecentDay ? `Yesterday (Day ${mostRecentDay})` : 'Yesterday'}</span>
                        </button>
                        
                        {/* Day dropdown - REPLACED with Dropdown component */}
                        {hasOtherDays && (
                            <Dropdown
                                togglerIcon={icons.Calendar}
                                togglerText={
                                    availableDays.includes(Number(timeframeState))
                                        ? `Day ${timeframeState}` 
                                        : 'Select Day'
                                }
                                togglerClasses={`${btnTogglerClasses} ${!hasOtherDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${availableDays.includes(Number(timeframeState)) ? btnActiveClasses : '' }` }
                                togglerTitle={hasOtherDays ? 'Select a day to view' : 'No historical data available'}
                                multiselect={false}
                                value={availableDays.includes(Number(timeframeState)) ? timeframeState : ''}
                                onChange={(value) => value && onTimeframeChange(value)}
                            >
                                {availableDays.map(day => (
                                    <DropdownItem 
                                        key={day} 
                                        value={String(day)} 
                                        text={`Day ${day}`} 
                                    />
                                ))}
                            </Dropdown>
                        )}
                        
                        {/* Placeholder when no other days */}
                        {!hasOtherDays && (
                            <button
                                className={`${btnBaseClasses} ${btnClasses} opacity-50 cursor-not-allowed`}
                                disabled={true}
                                title="No historical data available"
                            >
                                <icons.Calendar size={14} />
                                <span>Select Day</span>
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        {/* Compare mode dropdowns - REPLACED with Dropdown components */}
                        <Dropdown
                            togglerIcon={icons.Calendar}
                            togglerText={comparePrimaryDay ? formatDayLabel(comparePrimaryDay, mostRecentDay) : 'Select Primary Day'}
                            togglerTitle="Select primary comparison day"
                            togglerClasses={`${btnTogglerClasses} ${btnActiveClasses}`}
                            multiselect={false}
                            value={comparePrimaryDay ? String(comparePrimaryDay) : ''}
                            onChange={(value) => value && onComparePrimaryDayChange(value)}
                        >
                            {allDays
                                .filter(day => {
                                    const olderDays = allDays.filter(d => d < day);
                                    return olderDays.length > 0;
                                })
                                .map(day => (
                                    <DropdownItem
                                        key={day}
                                        value={String(day)}
                                        text={formatDayLabel(day, mostRecentDay)}
                                    />
                                ))
                            }
                        </Dropdown>
                        
                        <span className="text-xs font-medium">vs</span>
                        
                        <Dropdown
                            togglerIcon={icons.Calendar}
                            togglerText={compareSecondaryDay ? formatDayLabel(compareSecondaryDay, mostRecentDay) : 'Compare To'}
                            togglerTitle="Select secondary comparison day"
                            togglerClasses={`${btnTogglerClasses} ${btnActiveClasses}`}
                            multiselect={false}
                            value={compareSecondaryDay ? String(compareSecondaryDay) : ''}
                            onChange={(value) => value && onCompareSecondaryDayChange(value)}
                        >
                            {comparePrimaryDay && allDays
                                .filter(day => day < comparePrimaryDay)
                                .map(day => (
                                    <DropdownItem
                                        key={day}
                                        value={String(day)}
                                        text={formatDayLabel(day, mostRecentDay)}
                                    />
                                ))
                            }
                            {!comparePrimaryDay && (
                                <DropdownItem
                                    value=""
                                    text="Select primary day first"
                                    disabled={true}
                                />
                            )}
                        </Dropdown>
                        
                        {/* Percentage toggle */}
                        <button
                            className={`${btnBaseClasses} ${compareShowPercentages ? btnActiveClasses : btnClasses}`}
                            onClick={onCompareShowPercentagesChange}
                            title="Toggle percentage display"
                        >
                            <icons.Percent size={14} />
                        </button>
                    </>
                )}
                
                {/* Compare checkbox */}
                {availableDays.length > 0 && (
                    <>
                        <span className="border-primary border-r ml-2 mr-1 mr-2 opacity-40 py-2" />
                        
                        <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={compareMode}
                                    onChange={(e) => onCompareModeChange(e.target.checked)}
                                    className="cursor-pointer"
                                />
                            <span className="text-xs">Compare</span>
                        </label>
                    </>
                )}
            </div>
            <span className="max-w-4xl w-full"/>
            
            {/* Right side - Status indicator */}
            <div className="flex items-center gap-2 whitespace-nowrap">
                {!api.gameState.isPaused() && (
                    <>
                        <div className="absolute w-2 h-2 rounded-full bg-green-500 dark:bg-green-600 opacity-75 animate-ping"/>
                        <span className="relative inline-flex w-2 h-2 rounded-full dark:bg-green-500 bg-green-600"/>
                    </>
                )}
                {api.gameState.isPaused() && (
                    <>
                        <span className="text-xs">Game Paused</span>
                        <icons.Pause className="dark:text-amber-400 text-amber-600" size={14} />
                    </>
                )}
            </div>
        </div>
    );
}
