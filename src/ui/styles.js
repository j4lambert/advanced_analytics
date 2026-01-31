// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        html.dark #advanced-analytics {
            color-scheme: dark;
        }

        /* Fix for disabled button clickability bug */
        div:has(> div[title="Advanced Route Analytics"]) {
            pointer-events: auto;
        }
        
        /* Table styling */
        #advanced-analytics {
            scrollbar-width: thin;
            width: auto;
        }
        
        #advanced-analytics thead tr,
        #advanced-analytics th:first-child,
        #advanced-analytics td:first-child {
            position: sticky;
            left: 0;
        }
        
        /* Panel wrapper styling */
        #advanced-analytics-panel {
            background-color: transparent;
        }
        
        #advanced-analytics-panel > div:first-child {
            background-color: hsl(var(--background));
        }
        
        /* Wrapper (immediate parent of table) styling */
        #advanced-analytics-wrapper {
            padding: 0;
            width: auto;
        }

        /* Toolbar checkbox styling */
        .aa-toolbar-checkbox {
            appearance: none;
            width: 0;
            height: 0;
            position: absolute;
        }
    `;
    document.head.appendChild(style);
}
