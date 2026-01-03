// Advanced Analytics Mod for Subway Builder v2.0
// Refactored for API v1.0.0 - Clean, modern implementation

const AdvancedAnalytics = {
    // State
    modalOpen: false,
    updateInterval: null,
    sortState: {
        column: 'ridership',
        order: 'desc'
    },
    debug: true, // Set to false to enable auto-refresh

    // Configuration
    CONFIG: {
        UTILIZATION_THRESHOLDS: {
            CRITICAL_LOW: 30,
            CRITICAL_HIGH: 95,
            WARNING_LOW: 45,
            WARNING_HIGH: 85
        },
        REFRESH_INTERVAL: 1000,
        LOG_PREFIX: '[AA]',
        COST_MULTIPLIER: 365,
        DEMAND_HOURS: {
            low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
            medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
            high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
        },
        TABLE_HEADERS: [
            { key: 'name', label: 'Route', align: 'right' },
            { key: 'ridership', label: 'Ridership', align: 'right' },
            { key: 'capacity', label: 'Capacity', align: 'right' },
            { key: 'utilization', label: 'Use', align: 'right' },
            { key: 'stations', label: 'Stations', align: 'right' },
            { key: 'dailyCost', label: 'Cost', align: 'right' },
            { key: 'costPerPassenger', label: 'Cost/Pax', align: 'right' }
        ]
    },

    init() {
        if (!window.SubwayBuilderAPI) {
            console.error(`${this.CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }

        const api = window.SubwayBuilderAPI;

        api.hooks.onGameInit(() => {
            console.log(`${this.CONFIG.LOG_PREFIX} Mod initialized`);

            this.injectStyles();
            
            // Add button to bottom bar
            api.ui.addButton('bottom-bar', {
                id: 'aa-toggle-modal',
                label: 'Analytics',
                icon: 'BarChart3',
                onClick: () => this.toggleModal()
            });
        });
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            html.dark #aa-modal {
                color-scheme: dark;
            }
            #aa-modal {
                scrollbar-width: thin;
            }
            #aa-table-container thead tr,
            #aa-table-container th:first-child,
            #aa-table-container td:first-child {
                position: sticky;
                left:0;
            }
        `;
        document.head.appendChild(style);
    },

    toggleModal() {
        if (this.modalOpen) {
            this.closeModal();
        } else {
            this.openModal();
        }
    },

    openModal() {
        const api = window.SubwayBuilderAPI;
        const { React, components } = api.utils;
        const h = React.createElement;

        console.log(`${this.CONFIG.LOG_PREFIX} Opening modal`);
        this.modalOpen = true;

        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.id = 'aa-modal';
        modalContainer.className = 'fixed inset-0 z-50 pointer-events-none';
        
        // Create modal content wrapper (this gets pointer events)
        const modalContent = document.createElement('div');
        modalContent.className = 'pointer-events-auto bg-primary-foreground/60 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg flex flex-col absolute text-sm';
        modalContent.style.width = '800px';
        modalContent.style.height = '600px';
        // Center it by calculating top/left from viewport center
        modalContent.style.left = `calc(50% - 400px)`; // 50% - (width/2)
        modalContent.style.top = `calc(50% - 300px)`;  // 50% - (height/2)
        modalContent.style.resize = 'both';
        modalContent.style.overflow = 'hidden'; // Prevents scrollbar on resize container
        modalContent.style.minWidth = '400px';
        modalContent.style.minHeight = '300px';
        modalContent.style.maxWidth = '95vw';
        modalContent.style.maxHeight = '95vh';
        
        // Header
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between p-1 pl-4 border-b border-border select-none bg-primary-foreground min-h-9';
        header.innerHTML = `
            <h2 class="font-semibold">Advanced Route Analytics</h2>
            <button class="aa-close-btn hover:bg-muted rounded-md p-2 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        // Table container
        const tableContainer = document.createElement('div');
        tableContainer.id = 'aa-table-container';
        tableContainer.className = 'flex-1 overflow-auto';
        
        // Assemble modal
        modalContent.appendChild(header);
        modalContent.appendChild(tableContainer);
        modalContainer.appendChild(modalContent);
        document.body.appendChild(modalContainer);

        // Event listeners
        header.querySelector('.aa-close-btn').onclick = () => this.closeModal();

        // Make modal draggable
        this.makeDraggable(modalContent, header);

        // Initial render
        this.renderTable();

        // Auto-refresh (if not in debug mode)
        if (!this.debug) {
            this.updateInterval = setInterval(() => {
                this.renderTable();
            }, this.CONFIG.REFRESH_INTERVAL);
            console.log(`${this.CONFIG.LOG_PREFIX} Auto-refresh enabled`);
        } else {
            console.log(`${this.CONFIG.LOG_PREFIX} Debug mode: auto-refresh disabled`);
        }
    },

    closeModal() {
        console.log(`${this.CONFIG.LOG_PREFIX} Closing modal`);
        this.modalOpen = false;

        // Clear interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Remove modal
        const modal = document.getElementById('aa-modal');
        if (modal) {
            modal.remove();
        }
    },

    renderTable() {
        const container = document.getElementById('aa-table-container');
        if (!container) return;

        const api = window.SubwayBuilderAPI;
        
        // Get data from API
        const routes = api.gameState.getRoutes();
        const trainTypes = api.trains.getTrainTypes();
        const lineMetrics = api.gameState.getLineMetrics();

        // Process route data
        const tableData = [];

        routes.forEach(route => {
            // Find ridership from line metrics
            const metrics = lineMetrics.find(m => m.routeId === route.id);
            const ridership = metrics ? metrics.ridersPerHour : 0;

            // Validate route data
            if (!this.validateRouteData(route)) {
                tableData.push({
                    name: route.name || route.bullet,
                    ridership,
                    ...this.getEmptyMetrics()
                });
                return;
            }

            // Get train type
            const trainType = trainTypes[route.trainType];
            if (!trainType) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Train type not found: ${route.trainType}`);
                tableData.push({
                    name: route.name || route.bullet,
                    ridership,
                    ...this.getEmptyMetrics()
                });
                return;
            }

            // Calculate metrics
            const metrics_calc = this.calculateRouteMetrics(route, trainType, ridership);
            
            tableData.push({
                name: route.name || route.bullet,
                ridership,
                ...metrics_calc
            });
        });

        // Sort data
        this.sortTableData(tableData);

        // Build and render table
        container.innerHTML = '';
        const table = this.buildTable(tableData);
        container.appendChild(table);
    },

    calculateRouteMetrics(route, trainType, ridership) {
        const carsPerTrain = route.carsPerTrain !== undefined 
            ? route.carsPerTrain 
            : trainType.stats.carsPerCarSet;
        
        const capacityPerCar = trainType.stats.capacityPerCar;
        const capacityPerTrain = carsPerTrain * capacityPerCar;

        // Get train schedule
        const schedule = route.trainSchedule || {};
        const trainCounts = {
            high: schedule.highDemand || 0,
            medium: schedule.mediumDemand || 0,
            low: schedule.lowDemand || 0
        };

        let capacity = 0;
        let utilization = 0;
        let dailyCost = 0;

        // Calculate from timing data
        if (route.stComboTimings && route.stComboTimings.length > 0) {
            const timings = route.stComboTimings;
            const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;

            if (loopTimeSeconds > 0) {
                const loopsPerHour = 3600 / loopTimeSeconds;

                // Calculate capacity for each demand period
                const highCapacity = trainCounts.high * this.CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
                const mediumCapacity = trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
                const lowCapacity = trainCounts.low * this.CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;

                capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);

                // Calculate utilization
                if (capacity > 0) {
                    utilization = Math.round((ridership / capacity) * 100);
                }

                // Calculate daily operating cost
                const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const carCostPerHour = trainType.stats.carOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

                dailyCost = (trainCounts.low * this.CONFIG.DEMAND_HOURS.low * costPerTrainPerHour) +
                            (trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour) +
                            (trainCounts.high * this.CONFIG.DEMAND_HOURS.high * costPerTrainPerHour);
            }
        }

        // Get station count
        const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;

        // Calculate cost per passenger
        const costPerPassenger = ridership > 0 ? dailyCost / ridership : 0;

        return {
            capacity,
            utilization,
            stations,
            dailyCost,
            costPerPassenger
        };
    },

    buildTable(data) {
        const table = document.createElement('table');
        table.className = 'w-full text-sm border-collapse';

        // Build thead
        const thead = document.createElement('thead');
        thead.className = 'z-10 relative';
        const headerRow = document.createElement('tr');
        headerRow.className = 'top-0 border-b bg-primary-foreground/60 backdrop-blur-sm';

        this.CONFIG.TABLE_HEADERS.forEach(header => {
            const th = document.createElement('th');
            th.className = `h-12 px-3 text-${header.align} align-middle font-medium whitespace-nowrap cursor-pointer transition-colors ${this.getHeaderClasses(header.key)}`;
            th.setAttribute('data-sort', header.key);
            
            const indicator = document.createElement('span');
            indicator.className = !this.isColumnSorting(header.key) ? 'opacity-0' : '';
            indicator.textContent = this.getSortIndicator(header.key);
            
            th.appendChild(indicator);
            th.appendChild(document.createTextNode(' ' + header.label));

            th.onclick = () => {
                if (this.sortState.column === header.key) {
                    this.sortState.order = this.sortState.order === 'desc' ? 'asc' : 'desc';
                } else {
                    this.sortState.column = header.key;
                    this.sortState.order = 'desc';
                }
                this.renderTable();
            };

            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Build tbody
        const tbody = document.createElement('tbody');
        tbody.className = 'z-0';

        data.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.className = 'border-b transition-colors hover:bg-muted/50';

            // Route name
            tr.appendChild(this.createCell('name', row.name, 'right', 'w-0 font-medium bg-primary-foreground/60 backdrop-blur-sm'));

            // Ridership
            tr.appendChild(this.createCell('ridership', row.ridership.toLocaleString(), 'right', 'font-mono'));

            // Capacity
            tr.appendChild(this.createCell('capacity', 
                row.capacity > 0 ? row.capacity.toLocaleString() : 'N/A', 
                'right', 'font-mono'));

            // Utilization (with color coding)
            const utilizationClasses = row.utilization > 0 ? this.getUtilizationClasses(row.utilization) : '';
            const utilizationText = row.utilization > 0 ? '∿' + row.utilization + '%' : 'N/A';
            tr.appendChild(this.createCell('utilization', utilizationText, 'right', `font-mono ${utilizationClasses}`));

            // Stations
            tr.appendChild(this.createCell('stations', 
                row.stations > 0 ? row.stations : 'N/A', 
                'right', 'font-mono'));

            // Determine if we should show percentage changes
            // Find first row with non-zero value for the sorted column as baseline
            let baselineRow = null;
            if (this.sortState.column === 'dailyCost' || this.sortState.column === 'costPerPassenger') {
                const valueKey = this.sortState.column;
                baselineRow = data.find(r => r[valueKey] > 0);
            }
            
            const showCostPercentage = baselineRow && rowIndex > 0;

            // Daily cost
            const costText = row.dailyCost > 0 
                ? '$' + row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) 
                : 'N/A';
            
            let costPercentage = null;
            if (showCostPercentage && row.dailyCost > 0 && this.sortState.column === 'dailyCost') {
                costPercentage = this.calculatePercentageChange(row.dailyCost, baselineRow.dailyCost);
            }
            tr.appendChild(this.createCostCell('dailyCost', costText, costPercentage));

            // Cost per passenger
            const costPerPaxText = row.costPerPassenger > 0 
                ? '$' + row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) 
                : 'N/A';
            
            let costPerPaxPercentage = null;
            if (showCostPercentage && row.costPerPassenger > 0 && this.sortState.column === 'costPerPassenger') {
                costPerPaxPercentage = this.calculatePercentageChange(row.costPerPassenger, baselineRow.costPerPassenger);
            }
            tr.appendChild(this.createCostCell('costPerPassenger', costPerPaxText, costPerPaxPercentage));

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        return table;
    },

    createCell(columnKey, content, align, additionalClasses = '') {
        const td = document.createElement('td');
        td.className = `px-3 py-2 align-middle text-${align} ${this.getCellClasses(columnKey)} ${additionalClasses}`;
        td.textContent = content;
        return td;
    },

    createCostCell(columnKey, content, percentageChange = null) {
        const td = document.createElement('td');
        td.className = `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey)}`;

        const container = document.createElement('div');
        container.className = 'flex flex-col items-end gap-0.5';

        const value = document.createElement('div');
        value.textContent = content;
        container.appendChild(value);

        if (percentageChange !== null) {
            const percent = document.createElement('div');
            const isIncrease = percentageChange > 0;
            const colorClass = isIncrease ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
            percent.className = `text-[10px] ${colorClass}`;
            percent.textContent = `${isIncrease ? '+' : ''}${percentageChange.toFixed(1)}%`;
            container.appendChild(percent);
        }

        td.appendChild(container);
        return td;
    },

    // Helper methods
    validateRouteData(route) {
        return route && route.trainSchedule;
    },

    getEmptyMetrics() {
        return {
            capacity: 0,
            utilization: 0,
            stations: 0,
            dailyCost: 0,
            costPerPassenger: 0
        };
    },

    getUtilizationClasses(utilization) {
        const thresholds = this.CONFIG.UTILIZATION_THRESHOLDS;
        
        if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
            return 'text-red-600 dark:text-red-400';
        } else if ((utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW) || 
                   (utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH)) {
            return 'text-yellow-600 dark:text-yellow-400';
        }
        return 'text-green-600 dark:text-green-400';
    },

    calculatePercentageChange(currentValue, baselineValue) {
        if (baselineValue === 0) return null;
        return ((currentValue - baselineValue) / baselineValue) * 100;
    },

    getHeaderClasses(column) {
        if (this.sortState.column === column) {
            return 'text-foreground bg-muted/50';
        } else if (column === 'name') {
            return 'bg-primary-foreground/60 backdrop-blur-sm';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column) {
        if (this.sortState.column === column) {
            return 'bg-muted/50';
        }
        return '';
    },

    isColumnSorting(column) {
        return this.sortState.column === column;
    },

    getSortIndicator(column) {
        if (!this.isColumnSorting(column)) {
            return '↓';
        }
        return this.sortState.order === 'desc' ? '↓' : '↑';
    },

    sortTableData(data) {
        const column = this.sortState.column;
        const order = this.sortState.order;

        data.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // String sorting
            if (column === 'name') {
                return order === 'desc' 
                    ? bVal.localeCompare(aVal)
                    : aVal.localeCompare(bVal);
            }

            // Numeric sorting
            return order === 'desc' ? bVal - aVal : aVal - bVal;
        });
    },

    makeDraggable(modalElement, handleElement) {
        let isDragging = false;
        let initialMouseX;
        let initialMouseY;
        let initialModalLeft;
        let initialModalTop;

        handleElement.style.cursor = 'grab';

        handleElement.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            // Don't drag if clicking the close button
            if (e.target.closest('.aa-close-btn')) {
                return;
            }

            // Store initial mouse position
            initialMouseX = e.clientX;
            initialMouseY = e.clientY;
            
            // Store current modal position
            const rect = modalElement.getBoundingClientRect();
            initialModalLeft = rect.left;
            initialModalTop = rect.top;

            isDragging = true;
        }

        function drag(e) {
            if (!isDragging) return;

            e.preventDefault();

            // Calculate how far the mouse has moved
            const deltaX = e.clientX - initialMouseX;
            const deltaY = e.clientY - initialMouseY;

            // Calculate new position
            let newLeft = initialModalLeft + deltaX;
            let newTop = initialModalTop + deltaY;

            // Get modal dimensions for boundary checking
            const modalRect = modalElement.getBoundingClientRect();
            const headerHeight = handleElement.offsetHeight;
            
            // Apply boundaries - keep at least 100px visible on each side
            const minLeft = -modalRect.width + 100;
            const maxLeft = window.innerWidth - 100;
            const minTop = 0;
            const maxTop = window.innerHeight - headerHeight;
            
            newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
            newTop = Math.max(minTop, Math.min(newTop, maxTop));

            modalElement.style.left = `${newLeft}px`;
            modalElement.style.top = `${newTop}px`;
        }

        function dragEnd(e) {
            isDragging = false;
        }
    }
};

// Initialize mod
AdvancedAnalytics.init();

// Expose to window for debugging
window.AdvancedAnalytics = AdvancedAnalytics;