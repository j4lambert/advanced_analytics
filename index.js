const AdvancedAnalyticsMod = {
    button: null,
    dialog: null,
    isOpen: false,
    
    init() {
        console.log('Advanced Analytics Mod initializing...');
        this.injectStyles();
        this.setupUI();
    },
    
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .aa-dialog {
                position: fixed;
                z-index: 10000;
                min-width: 400px;
                max-width: 90vw;
                max-height: 80vh;
            }
            .aa-dialog-header {
                cursor: move;
                user-select: none;
            }
        `;
        document.head.appendChild(style);
    },
    
    setupUI() {
        window.SubwayBuilderAPI.hooks.onGameInit(() => {
            const observer = new MutationObserver(() => {
                const targetArea = document.querySelector('[data-tutorial="statistics-button"]');
                
                if (targetArea && !this.button) {
                    this.createButton(targetArea);
                    observer.disconnect();
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    },
    
    createButton(targetArea) {
        this.button = document.createElement('button');
        this.button.id = 'aa-mod-button';
        this.button.onclick = () => this.toggleDialog();
        this.button.innerHTML = `
            <div id="aa-button-inner" class="aspect-square h-full rounded-full bg-primary-foreground/20 p-2 border-2 border-primary/15 cursor-pointer text-primary stroke-[1px] shadow-md ring-0 hover:bg-primary-foreground/30">
                AA
            </div>
        `;
        
        targetArea.after(this.button);
        console.log('✅ Advanced Analytics button added');
    },
    
    toggleDialog() {
        if (this.isOpen) {
            this.closeDialog();
        } else {
            this.openDialog();
        }
    },
    
    openDialog() {
        this.isOpen = true;
        
        // Toggle button classes
        const buttonInner = document.getElementById('aa-button-inner');
        buttonInner.className = "aspect-square h-full rounded-full p-2 border-2 border-primary/15 cursor-pointer text-primary stroke-[1px] shadow-md ring-0 bg-blue-300 hover:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-500";
        
        // Create dialog
        this.dialog = document.createElement('div');
        this.dialog.className = 'aa-dialog bg-transparent flex flex-col h-fit items-center justify-center max-h-full overflow-hidden pointer-events-auto rounded-sm shadow-md text-sm';
        this.dialog.style.left = '50%';
        this.dialog.style.top = '50%';
        this.dialog.style.transform = 'translate(-50%, -50%)';
        
        this.dialog.innerHTML = `
            <div class="aa-dialog-header flex h-9 min-h-9 w-full p-1 border-b border-primary/15 items-center justify-between bg-primary-foreground">
                <div class="flex items-center h-full w-full"></div>
                <div class="aa-dialog-title flex items-center h-full w-full">
                    <h2 class="font-semibold whitespace-nowrap">XAdvanced Analytics</h2>
                </div>
                <div class="flex items-center h-full w-full gap-1 justify-end">
                    <div class="flex items-center h-full w-fit">
                        <button class="aa-dialog-close inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-full aspect-square p-1 ml-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x w-full h-full">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="aa-dialog-content w-full p-2 flex bg-primary-foreground/60 backdrop-blur-sm max-h-auto overflow-auto min-w-80 justify-center">
                <div class="flex flex-col w-full">
                    <h3 style="margin-bottom: 12px; font-weight: 600;">Subway Statistics</h3>
                    <p style="margin-bottom: 8px;">Total Stations: Loading...</p>
                    <p style="margin-bottom: 8px;">Total Routes: Loading...</p>
                    <p style="margin-bottom: 8px;">Active Trains: Loading...</p>
                    <p style="margin-bottom: 8px;">Current Day: Loading...</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.dialog);
        
        // Attach event listeners after innerHTML
        const header = this.dialog.querySelector('.aa-dialog-header');
        const closeButton = this.dialog.querySelector('.aa-dialog-close');
        const content = this.dialog.querySelector('.aa-dialog-content');
        
        closeButton.onclick = () => this.closeDialog();
        
        // Make draggable
        this.makeDraggable(this.dialog, header);
        
        // Load actual data
        this.updateDialogContent(content);
    },
    
    closeDialog() {
        this.isOpen = false;
        
        // Toggle button classes back
        const buttonInner = document.getElementById('aa-button-inner');
        buttonInner.className = "aspect-square h-full rounded-full bg-primary-foreground/20 p-2 border-2 border-primary/15 cursor-pointer text-primary stroke-[1px] shadow-md ring-0 hover:bg-primary-foreground/30";
        
        // Remove dialog
        if (this.dialog) {
            this.dialog.remove();
            this.dialog = null;
        }
    },
    
    updateDialogContent(content) {
        const stations = window.SubwayBuilderAPI.gameState.getStations();
        const routes = window.SubwayBuilderAPI.gameState.getRoutes();
        const trains = window.SubwayBuilderAPI.gameState.getTrains();
        const day = window.SubwayBuilderAPI.gameState.getCurrentDay();
        
        content.innerHTML = `
            <div class="flex flex-col w-full">
                <h3 style="margin-bottom: 12px; font-weight: 600;">Subway Statistics</h3>
                <p style="margin-bottom: 8px;">Total Stations: ${stations.length}</p>
                <p style="margin-bottom: 8px;">Total Routes: ${routes.length}</p>
                <p style="margin-bottom: 8px;">Active Trains: ${trains.length}</p>
                <p style="margin-bottom: 8px;">Current Day: ${day}</p>
            </div>
        `;
    },
    
    makeDraggable(dialog, header) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        
        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking the close button
            if (e.target.closest('.aa-dialog-close')) return;
            
            isDragging = true;
            
            const rect = dialog.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;
            
            dialog.style.transform = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            dialog.style.left = currentX + 'px';
            dialog.style.top = currentY + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
};

// Initialize
if (window.SubwayBuilderAPI) {
    AdvancedAnalyticsMod.init();
} else {
    console.error('SubwayBuilderAPI not available!');
}

// Expose for console debugging
window.AdvancedAnalyticsMod = AdvancedAnalyticsMod;