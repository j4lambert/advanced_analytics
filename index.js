// Advanced Analytics Mod for Subway Builder
// Enhances Route Ridership panel with additional metrics

const AdvancedAnalytics = {
    observer: null,
    updateInterval: null,
    currentSortColumn: 'ridership',
    currentSortOrder: 'desc',
    debug: true, // Set to false to enable auto-refresh

    init() {        
        // Use proper lifecycle hook instead of immediate execution
        if (window.SubwayBuilderAPI) {
            window.SubwayBuilderAPI.hooks.onGameInit(() => {
                console.log('[Advanced Analytics] Mod initialized, starting panel watch...');
                this.injectStyles();
                this.watchForPanel();
            });
        } else {
            console.error('[Advanced Analytics] SubwayBuilderAPI not available');
        }
    },
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            html.dark .aa-wrapper {
                color-scheme: dark;
            }
            .aa-badge-container > div {
                display: flex;
                justify-content: end;
            }
        `;
        document.head.appendChild(style);
    },

    watchForPanel() {
        // Watch for the Route Ridership panel to appear
        this.observer = new MutationObserver(() => {
            const titleEls = document.querySelectorAll('.text-base.font-medium');
            
            const titleEl = Array.from(titleEls)
                .find(el => el.textContent.includes('Route Ridership'));
            
            if (titleEl && !titleEl.hasAttribute('data-aa-processed')) {
                console.log('[Advanced Analytics] Route Ridership panel detected');
                titleEl.setAttribute('data-aa-processed', 'true');
                this.enhancePanel(titleEl);
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    enhancePanel(titleEl) {
        console.log('[Advanced Analytics] Enhancing panel...');

        // Find the panel wrapper
        const wrapperEl = titleEl.closest('.flex.bg-primary-foreground\\/60');
        if (!wrapperEl) {
            console.error('[Advanced Analytics] Could not find panel wrapper');
            return;
        }
        wrapperEl.classList.remove('p-2');
        wrapperEl.classList.add('aa-wrapper');

        // Find the existing content div
        const existingContentEl = wrapperEl.querySelector('.flex.flex-col.gap-2.w-full.h-full');
        if (!existingContentEl) {
            console.error('[Advanced Analytics] Could not find existing content');
            return;
        }

        // Add identifying class for navigation detection
        existingContentEl.classList.add('aa-sb-content');

        // Click "Show more" button if it exists to reveal all routes
        const showMoreButtonEl = existingContentEl.querySelector('button');
        if (showMoreButtonEl && showMoreButtonEl.textContent.includes('Show')) {
            console.log('[Advanced Analytics] Clicking "Show more" button');
            showMoreButtonEl.click();
        }

        // Hide the existing content but keep it in DOM for data extraction and click forwarding
        existingContentEl.classList.add('absolute', 'pointer-events-none', 'opacity-0', 'z-0', 'overflow-hidden');
        

        // Create table container with higher z-index
        const tableContainerEl = document.createElement('section');
        tableContainerEl.className = 'aa-table-container w-full max-w-5xl z-20 relative';
        wrapperEl.appendChild(tableContainerEl);

        // Initial render
        this.renderTable(tableContainerEl, existingContentEl);

        // Update table every second (only if not in debug mode)
        if (!this.debug) {
            this.updateInterval = setInterval(() => {
                this.renderTable(tableContainerEl, existingContentEl);
            }, 1000);
            console.log('[Advanced Analytics] Auto-refresh enabled (every 1s)');
        } else {
            console.log('[Advanced Analytics] Debug mode: auto-refresh disabled');
        }

        // Watch for navigation
        this.watchForNavigation(wrapperEl, existingContentEl, tableContainerEl);
    },

    watchForNavigation(wrapperEl, existingContentEl, tableContainerEl) {
        const navigationObserver = new MutationObserver(() => {
            // Check if aa-sb-content still exists in the wrapper
            const sbContentEl = wrapperEl.querySelector('.aa-sb-content');
            
            if (!sbContentEl) {
                // Content was replaced (navigated away), clean up
                console.log('[Advanced Analytics] Navigation detected, cleaning up...');
                
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                    this.updateInterval = null;
                }
                
                // Remove table container
                if (tableContainerEl && tableContainerEl.parentElement) {
                    tableContainerEl.remove();
                }
                
                navigationObserver.disconnect();
                
                // Reset the processed flag so observer can detect the panel again
                const processedTitleEl = document.querySelector('[data-aa-processed="true"]');
                if (processedTitleEl) {
                    processedTitleEl.removeAttribute('data-aa-processed');
                }
                wrapperEl.classList.add('p-2');
                wrapperEl.classList.remove('aa-wrapper');
                
                console.log('[Advanced Analytics] Cleanup complete, ready to re-enhance on return');
            }
        });

        navigationObserver.observe(wrapperEl, {
            childList: true,
            subtree: false
        });
    },

    getUtilizationClasses(utilization) {
        if (utilization < 30 || utilization > 95) {
            return 'text-red-600 dark:text-red-400';
        } else if ((utilization >= 30 && utilization < 45) || (utilization >= 85 && utilization <= 95)) {
            return 'text-yellow-600 dark:text-yellow-400';
        } else {
            return 'text-green-600 dark:text-green-400';
        }
    },

    renderTable(containerEl, sourceEl) {
        const routeListEl = sourceEl.querySelector('.flex.flex-col.gap-1');
        if (!routeListEl) {
            console.warn('[Advanced Analytics] Route list not found during render');
            return;
        }

        // Get all route entries (excluding the "Show more" button)
        const routeEntryEls = Array.from(routeListEl.children).filter(
            child => child.classList.contains('flex') && 
                     child.classList.contains('items-center') &&
                     child.classList.contains('bg-transparent')
        );

        // Get route data and train types from API
        const routes = window.SubwayBuilderAPI.gameState.getRoutes();
        const trainTypes = window.SubwayBuilderAPI.trains.getTrainTypes();

        // Demand period durations in hours
        const DEMAND_HOURS = {
            low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
            medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
            high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
        };

        // Cost multiplier to convert API values to actual game costs
        const COST_MULTIPLIER = 365;

        // Build data array
        const tableData = [];

        routeEntryEls.forEach((ridershipEntryEl) => {
            // Extract route bullet text from badge
            const routeBadgeEl = ridershipEntryEl.querySelector('div[style*="height: 1rem"]');
            const bulletText = routeBadgeEl?.querySelector('span')?.textContent.trim() || '';
            
            // Clone badge for display and store reference to original for click forwarding
            const clonedBadgeEl = routeBadgeEl?.cloneNode(true) || null;
            const originalBadgeEl = routeBadgeEl;
            
            // Extract ridership from DOM
            const ridershipEl = ridershipEntryEl.querySelector('.font-mono.font-semibold');
            const ridershipText = ridershipEl?.textContent.trim() || '0';
            const dailyRidership = parseInt(ridershipText.replace(/,/g, ''), 10) || 0;
            
            // Find matching route by bullet
            const route = routes.find(r => r.bullet === bulletText);
            
            const rowData = {
                badgeEl: clonedBadgeEl,
                originalBadgeEl: originalBadgeEl,
                bullet: bulletText,
                ridership: dailyRidership,
                capacity: 0,
                utilization: 0,
                stations: 0,
                trainsPerHourHigh: 0,
                trainsPerHourMedium: 0,
                trainsPerHourLow: 0,
                dailyCost: 0,
                costPerPassenger: 0
            };
            
            if (route) {
                const trainType = route.trainType;
                const schedule = route.trainSchedule;
                
                // Calculate stations served
                if (route.stNodes && route.stNodes.length > 0) {
                    // Subtract 1 because the last station is the same as the first (circular route)
                    rowData.stations = route.stNodes.length - 1;
                }
                
                if (trainTypes[trainType]) {
                    const carsPerTrain = route.carsPerTrain !== undefined 
                        ? route.carsPerTrain 
                        : trainTypes[trainType].stats.carsPerCarSet;
                    
                    const capacityPerCar = trainTypes[trainType].stats.capacityPerCar;
                    const capacityPerTrain = carsPerTrain * capacityPerCar;
                    
                    // Calculate loop time and trains per hour from stComboTimings
                    if (route.stComboTimings && route.stComboTimings.length > 0) {
                        const timings = route.stComboTimings;
                        const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
                        
                        if (loopTimeSeconds > 0) {
                            const loopsPerHour = 3600 / loopTimeSeconds;
                            
                            // Calculate trains per hour for each demand period
                            rowData.trainsPerHourHigh = Math.round(schedule.highDemand * loopsPerHour * 10) / 10;
                            rowData.trainsPerHourMedium = Math.round(schedule.mediumDemand * loopsPerHour * 10) / 10;
                            rowData.trainsPerHourLow = Math.round(schedule.lowDemand * loopsPerHour * 10) / 10;
                            
                            // Calculate actual daily capacity
                            const highCapacity = schedule.highDemand * DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
                            const mediumCapacity = schedule.mediumDemand * DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
                            const lowCapacity = schedule.lowDemand * DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;
                            
                            rowData.capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);
                            
                            // Calculate capacity utilization percentage
                            if (rowData.capacity > 0) {
                                rowData.utilization = Math.round((dailyRidership / rowData.capacity) * 100);
                            }
                        }
                    }
                    
                    // Calculate daily operating cost
                    const trainCostPerHour = trainTypes[trainType].stats.trainOperationalCostPerHour * COST_MULTIPLIER;
                    const carCostPerHour = trainTypes[trainType].stats.carOperationalCostPerHour * COST_MULTIPLIER;
                    const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);
                    
                    rowData.dailyCost = (schedule.lowDemand * DEMAND_HOURS.low * costPerTrainPerHour) +
                                        (schedule.mediumDemand * DEMAND_HOURS.medium * costPerTrainPerHour) +
                                        (schedule.highDemand * DEMAND_HOURS.high * costPerTrainPerHour);
                    
                    // Calculate cost per passenger
                    if (dailyRidership > 0) {
                        rowData.costPerPassenger = rowData.dailyCost / dailyRidership;
                    }
                }
            }
            
            tableData.push(rowData);
        });

        // Sort data
        this.sortTableData(tableData);

        // Build table structure
        const tableEl = document.createElement('table');
        tableEl.className = 'w-full caption-bottom';
        
        // Build thead
        const theadEl = document.createElement('thead');
        theadEl.className = '[&_tr]:border-b';
        const headerRowEl = document.createElement('tr');
        headerRowEl.className = 'border-b';
        
        const headers = [
            { key: 'badge', label: 'Route', align: 'left' },
            { key: 'ridership', label: 'Ridership', align: 'right' },
            { key: 'capacity', label: 'Capacity', align: 'right' },
            { key: 'utilization', label: 'Use', align: 'right' },
            { key: 'stations', label: 'Stations', align: 'right' },
            { key: 'dailyCost', label: 'Cost', align: 'right' },
            { key: 'costPerPassenger', label: 'Cost/Pax', align: 'right' }
        ];
        
        headers.forEach(header => {
            const thEl = document.createElement('th');
            thEl.className = `border-1 border-s border h-12 px-3 text-${header.align} align-middle font-medium whitespace-nowrap cursor-pointer ${this.getHeaderClasses(header.key)}`;
            thEl.setAttribute('data-sort', header.key);
            thEl.innerHTML = `<span class="${!this.isColumnSorting(header.key) ? 'opacity-0': ''}">${this.getSortIndicator(header.key)}</span> ${header.label}`;
            
            thEl.onclick = () => {
                // Toggle order if clicking same column, otherwise default to desc
                if (this.currentSortColumn === header.key) {
                    this.currentSortOrder = this.currentSortOrder === 'desc' ? 'asc' : 'desc';
                } else {
                    this.currentSortColumn = header.key;
                    this.currentSortOrder = 'desc';
                }
                
                this.renderTable(containerEl, sourceEl);
            };
            
            headerRowEl.appendChild(thEl);
        });
        
        theadEl.appendChild(headerRowEl);
        tableEl.appendChild(theadEl);
        
        // Build tbody
        const tbodyEl = document.createElement('tbody');
        tbodyEl.className = '[&_tr:last-child]:border-0';
        
        tableData.forEach((row, rowIndex) => {
            const trEl = document.createElement('tr');
            trEl.className = 'border-b transition-colors hover:bg-muted/50';
            
            // Badge column
            const badgeTdEl = document.createElement('td');
            badgeTdEl.className = `py-2 px-3 align-middle font-medium ${this.getCellClasses('badge')}`;
            const badgeContainerEl = document.createElement('div');
            badgeContainerEl.style.height = '1rem';
            badgeContainerEl.style.maxHeight = '1rem';
            badgeContainerEl.className = 'aa-badge-container cursor-pointer';
            
            if (row.badgeEl) {
                badgeContainerEl.appendChild(row.badgeEl);
                
                // Forward clicks to the actual clickable element inside the original badge
                badgeContainerEl.onclick = (e) => {
                    e.stopPropagation();
                    
                    // Find the clickable element in the original badge
                    const originalClickableEl = row.originalBadgeEl?.querySelector('.cursor-pointer');
                    
                    if (originalClickableEl) {
                        console.log('[Advanced Analytics] Forwarding click to clickable element for:', row.bullet);
                        originalClickableEl.click();
                    } else {
                        console.warn('[Advanced Analytics] Could not find clickable element for:', row.bullet);
                    }
                };
            }
            badgeTdEl.appendChild(badgeContainerEl);
            trEl.appendChild(badgeTdEl);
            
            // Ridership column
            const ridershipTdEl = document.createElement('td');
            ridershipTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('ridership')}`;
            ridershipTdEl.textContent = row.ridership.toLocaleString();
            trEl.appendChild(ridershipTdEl);
            
            // Capacity column
            const capacityTdEl = document.createElement('td');
            capacityTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('capacity')}`;
            capacityTdEl.textContent = row.capacity > 0 ? row.capacity.toLocaleString() : 'N/A';
            trEl.appendChild(capacityTdEl);
            
            // Utilization column (with conditional colors)
            const utilizationTdEl = document.createElement('td');
            const utilizationClasses = row.utilization > 0 ? this.getUtilizationClasses(row.utilization) : '';
            utilizationTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('utilization')} ${utilizationClasses}`;
            utilizationTdEl.textContent = row.utilization > 0 ? '∿' + row.utilization + '%' : 'N/A';
            trEl.appendChild(utilizationTdEl);
            
            // Stations column
            const stationsTdEl = document.createElement('td');
            stationsTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('stations')}`;
            stationsTdEl.textContent = row.stations > 0 ? row.stations : 'N/A';
            trEl.appendChild(stationsTdEl);
            
            // Daily cost column
            const costTdEl = document.createElement('td');
            costTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('dailyCost')}`;
            costTdEl.textContent = row.dailyCost > 0 ? '$' + row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A';
            trEl.appendChild(costTdEl);
            
            // Cost per passenger column
            const costPerPassengerTdEl = document.createElement('td');
            costPerPassengerTdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses('costPerPassenger')}`;
            costPerPassengerTdEl.textContent = row.costPerPassenger > 0 ? '$' + row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A';
            trEl.appendChild(costPerPassengerTdEl);
            
            tbodyEl.appendChild(trEl);
        });
        
        tableEl.appendChild(tbodyEl);
        
        // Clear container and append table
        containerEl.innerHTML = '';
        containerEl.appendChild(tableEl);
    },

    getHeaderClasses(column) {
        if (this.currentSortColumn === column) {
            return 'text-foreground bg-muted/50';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column) {
        if (this.currentSortColumn === column) {
            return 'bg-muted/50';
        }
        return '';
    },

    sortTableData(data) {
        const column = this.currentSortColumn;
        const order = this.currentSortOrder;
        
        data.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Handle string sorting for badge/bullet
            if (column === 'badge' || column === 'bullet') {
                aVal = a.bullet;
                bVal = b.bullet;
                return order === 'desc' 
                    ? bVal.localeCompare(aVal)
                    : aVal.localeCompare(bVal);
            }
            
            // Numeric sorting
            if (order === 'desc') {
                return bVal - aVal;
            } else {
                return aVal - bVal;
            }
        });
    },

    isColumnSorting(column) {
        return this.currentSortColumn === column;
    },

    getSortIndicator(column) {
        if (!this.isColumnSorting) {
            return '↓';
        }
        return this.currentSortOrder === 'desc' ? '↓' : '↑';
    },

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
};

// Initialize mod
AdvancedAnalytics.init();

// Expose to window for debugging
window.AdvancedAnalytics = AdvancedAnalytics;