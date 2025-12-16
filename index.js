// Advanced Analytics Mod for Subway Builder
// Enhances Route Ridership panel with additional metrics

const AdvancedAnalytics = {
    observer: null,
    contentObserver: null,
    routeIdCounter: 0,

    init() {
        console.log('[Advanced Analytics] Initializing mod...');
        
        // Use proper lifecycle hook instead of immediate execution
        if (window.SubwayBuilderAPI) {
            window.SubwayBuilderAPI.hooks.onGameInit(() => {
                console.log('[Advanced Analytics] Game initialized, starting panel watch...');
                this.watchForPanel();
            });
        } else {
            console.error('[Advanced Analytics] SubwayBuilderAPI not available');
        }
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
        const wrapperEl = titleEl.closest('.p-2.flex.bg-primary-foreground\\/60');
        if (!wrapperEl) {
            console.error('[Advanced Analytics] Could not find panel wrapper');
            return;
        }

        // Add classes to wrapper
        wrapperEl.classList.add('flex-row');
        wrapperEl.classList.remove('min-w-80');

        // Find the existing content div
        const existingContentEl = wrapperEl.querySelector('.flex.flex-col.gap-2.w-full.h-full');
        if (!existingContentEl) {
            console.error('[Advanced Analytics] Could not find existing content');
            return;
        }

        // Add class to existing content
        existingContentEl.classList.add('min-w-80');

        // Create all columns
        const capacityColumnEl = this.createColumn('Daily Capacity');
        const highDemandColumnEl = this.createColumn('High Demand');
        const mediumDemandColumnEl = this.createColumn('Medium Demand');
        const lowDemandColumnEl = this.createColumn('Low Demand');
        const costColumnEl = this.createColumn('Daily Cost');
        const costPerPassengerColumnEl = this.createColumn('Cost/Passenger');
        
        wrapperEl.appendChild(capacityColumnEl);
        wrapperEl.appendChild(highDemandColumnEl);
        wrapperEl.appendChild(mediumDemandColumnEl);
        wrapperEl.appendChild(lowDemandColumnEl);
        wrapperEl.appendChild(costColumnEl);
        wrapperEl.appendChild(costPerPassengerColumnEl);

        // Initial sync
        this.syncColumns(existingContentEl, capacityColumnEl, highDemandColumnEl, mediumDemandColumnEl, lowDemandColumnEl, costColumnEl, costPerPassengerColumnEl);

        // Watch for changes in ridership column
        this.watchRidershipColumn(existingContentEl, wrapperEl);
    },

    createColumn(title) {
        const columnEl = document.createElement('div');
        columnEl.className = 'flex flex-col gap-2 w-full border-l border-primary/15 pl-2';
        columnEl.innerHTML = `
            <div class="text-base font-medium whitespace-nowrap">
                ${title}
            </div>
            <div class="aa-list flex flex-col gap-1"></div>
        `;
        return columnEl;
    },

    watchRidershipColumn(ridershipContentEl, wrapperEl) {
        // Find the route list container
        const routeListEl = ridershipContentEl.querySelector('.flex.flex-col.gap-1');
        if (!routeListEl) {
            console.error('[Advanced Analytics] Could not find route list');
            return;
        }

        // Get all column references
        const columnEls = wrapperEl.querySelectorAll('.border-l.border-primary\\/15');
        const capacityColumnEl = columnEls[0];
        const highDemandColumnEl = columnEls[1];
        const mediumDemandColumnEl = columnEls[2];
        const lowDemandColumnEl = columnEls[3];
        const costColumnEl = columnEls[4];
        const costPerPassengerColumnEl = columnEls[5];

        // Watch for changes in the route list
        this.contentObserver = new MutationObserver(() => {
            this.syncColumns(ridershipContentEl, capacityColumnEl, highDemandColumnEl, mediumDemandColumnEl, lowDemandColumnEl, costColumnEl, costPerPassengerColumnEl);
        });

        this.contentObserver.observe(routeListEl, {
            childList: true,
            subtree: true
        });

        // Watch for navigation (when content is replaced)
        const navigationObserver = new MutationObserver(() => {
            const sbContentEl = wrapperEl.querySelector('.min-w-80');
            if (!sbContentEl) {
                // Content was removed, clean up and reactivate main observer
                console.log('[Advanced Analytics] Panel navigation detected, cleaning up...');
                
                if (this.contentObserver) {
                    this.contentObserver.disconnect();
                    this.contentObserver = null;
                }
                
                // Remove all added columns
                columnEls.forEach(columnEl => {
                    if (columnEl?.parentElement) columnEl.remove();
                });
                
                // Restore original wrapper classes
                wrapperEl.classList.remove('flex-row');
                wrapperEl.classList.add('min-w-80');
                
                navigationObserver.disconnect();
                
                // Reset the processed flag so the observer can detect the panel again
                const processedTitleEl = document.querySelector('[data-aa-processed="true"]');
                if (processedTitleEl) {
                    processedTitleEl.removeAttribute('data-aa-processed');
                }
            }
        });

        navigationObserver.observe(wrapperEl, {
            childList: true,
            subtree: false
        });
    },

    syncColumns(ridershipContentEl, capacityColumnEl, highDemandColumnEl, mediumDemandColumnEl, lowDemandColumnEl, costColumnEl, costPerPassengerColumnEl) {
        const routeListEl = ridershipContentEl.querySelector('.flex.flex-col.gap-1');
        if (!routeListEl) {
            console.warn('[Advanced Analytics] Route list not found during sync');
            return;
        }

        const capacityListEl = capacityColumnEl.querySelector('.aa-list');
        const highDemandListEl = highDemandColumnEl.querySelector('.aa-list');
        const mediumDemandListEl = mediumDemandColumnEl.querySelector('.aa-list');
        const lowDemandListEl = lowDemandColumnEl.querySelector('.aa-list');
        const costListEl = costColumnEl.querySelector('.aa-list');
        const costPerPassengerListEl = costPerPassengerColumnEl.querySelector('.aa-list');
        
        if (!capacityListEl || !highDemandListEl || !mediumDemandListEl || !lowDemandListEl || !costListEl || !costPerPassengerListEl) {
            console.error('[Advanced Analytics] Missing column lists');
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
        // (API reports annual costs, game uses daily costs equivalent to a year)
        const COST_MULTIPLIER = 365;

        // Assign unique IDs to route entries if not already assigned
        routeEntryEls.forEach((entryEl) => {
            if (!entryEl.hasAttribute('data-aa-route-id')) {
                entryEl.setAttribute('data-aa-route-id', `route-${this.routeIdCounter++}`);
            }
        });

        // Build entries for each column
        const capacityHTML = [];
        const highDemandHTML = [];
        const mediumDemandHTML = [];
        const lowDemandHTML = [];
        const costHTML = [];
        const costPerPassengerHTML = [];

        routeEntryEls.forEach((ridershipEntryEl) => {
            const routeId = ridershipEntryEl.getAttribute('data-aa-route-id');
            
            // Extract route bullet text from badge
            const routeBadgeEl = ridershipEntryEl.querySelector('div[style*="height: 1rem"]');
            const bulletText = routeBadgeEl?.querySelector('span')?.textContent.trim() || '';
            
            // Extract ridership from DOM
            const ridershipEl = ridershipEntryEl.querySelector('.font-mono.font-semibold');
            const ridershipText = ridershipEl?.textContent.trim() || '0';
            const dailyRidership = parseInt(ridershipText.replace(/,/g, ''), 10) || 0;
            
            // Find matching route by bullet
            const route = routes.find(r => r.bullet === bulletText);
            
            // Calculate capacity, trains per hour, daily cost, and cost per passenger
            let capacity = 0;
            let trainsPerHour = { high: 0, medium: 0, low: 0 };
            let dailyCost = 0;
            let costPerPassenger = 0;
            
            if (route) {
                const trainType = route.trainType;
                const schedule = route.trainSchedule;
                
                if (trainTypes[trainType]) {
                    // Use route's carsPerTrain if available, otherwise fallback to train type's default
                    const carsPerTrain = route.carsPerTrain !== undefined 
                        ? route.carsPerTrain 
                        : trainTypes[trainType].stats.carsPerCarSet;
                    
                    const capacityPerCar = trainTypes[trainType].stats.capacityPerCar;
                    const dailyTrains = schedule.highDemand + schedule.mediumDemand + schedule.lowDemand;
                    capacity = dailyTrains * carsPerTrain * capacityPerCar;
                    
                    // Calculate cost per train per hour
                    const trainCostPerHour = trainTypes[trainType].stats.trainOperationalCostPerHour * COST_MULTIPLIER;
                    const carCostPerHour = trainTypes[trainType].stats.carOperationalCostPerHour * COST_MULTIPLIER;
                    const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);
                    
                    // Calculate daily operating cost
                    dailyCost = (schedule.lowDemand * DEMAND_HOURS.low * costPerTrainPerHour) +
                               (schedule.mediumDemand * DEMAND_HOURS.medium * costPerTrainPerHour) +
                               (schedule.highDemand * DEMAND_HOURS.high * costPerTrainPerHour);
                    
                    // Calculate cost per passenger
                    if (dailyRidership > 0) {
                        costPerPassenger = dailyCost / dailyRidership;
                    }
                    
                    // Calculate loop time from stComboTimings
                    if (route.stComboTimings && route.stComboTimings.length > 0) {
                        const timings = route.stComboTimings;
                        const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
                        
                        if (loopTimeSeconds > 0) {
                            // Calculate trains per hour for each demand period
                            trainsPerHour.high = Math.round(schedule.highDemand * (3600 / loopTimeSeconds) * 10) / 10;
                            trainsPerHour.medium = Math.round(schedule.mediumDemand * (3600 / loopTimeSeconds) * 10) / 10;
                            trainsPerHour.low = Math.round(schedule.lowDemand * (3600 / loopTimeSeconds) * 10) / 10;
                        } else {
                            console.warn(`[Advanced Analytics] Invalid loop time for route ${bulletText}`);
                        }
                    }
                } else {
                    console.warn(`[Advanced Analytics] Train type not found: ${trainType}`);
                }
            } else {
                console.warn(`[Advanced Analytics] Route not found for bullet: ${bulletText}`);
            }
            
            // Build HTML for each column
            const baseClasses = 'flex items-center bg-transparent h-6 relative pl-1';
            const barClasses = 'bg-primary/20 absolute left-0 top-0 h-full rounded-r-md transition-transform duration-30 -z-10';
            const textClasses = 'text-xs ml-auto font-mono font-semibold pr-1';
            
            capacityHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${capacity > 0 ? capacity.toLocaleString() : 'N/A'}</p>
                </div>
            `);
            
            highDemandHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${trainsPerHour.high > 0 ? trainsPerHour.high : 'N/A'}</p>
                </div>
            `);
            
            mediumDemandHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${trainsPerHour.medium > 0 ? trainsPerHour.medium : 'N/A'}</p>
                </div>
            `);
            
            lowDemandHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${trainsPerHour.low > 0 ? trainsPerHour.low : 'N/A'}</p>
                </div>
            `);
            
            costHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${dailyCost > 0 ? '$' + dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'}</p>
                </div>
            `);
            
            costPerPassengerHTML.push(`
                <div class="${baseClasses}" data-aa-route-id="${routeId}">
                    <div class="${barClasses}" style="width: 0%;"></div>
                    <p class="${textClasses}">${costPerPassenger > 0 ? '$' + costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A'}</p>
                </div>
            `);
        });

        capacityListEl.innerHTML = capacityHTML.join('');
        highDemandListEl.innerHTML = highDemandHTML.join('');
        mediumDemandListEl.innerHTML = mediumDemandHTML.join('');
        lowDemandListEl.innerHTML = lowDemandHTML.join('');
        costListEl.innerHTML = costHTML.join('');
        costPerPassengerListEl.innerHTML = costPerPassengerHTML.join('');
        
        console.log(`[Advanced Analytics] Synced ${routeEntryEls.length} routes with all analytics data`);
    },

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.contentObserver) {
            this.contentObserver.disconnect();
        }
    }
};

// Initialize mod
AdvancedAnalytics.init();

// Expose to window for debugging
window.AdvancedAnalytics = AdvancedAnalytics;