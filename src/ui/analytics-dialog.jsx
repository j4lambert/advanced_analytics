// Analytics Dialog Wrapper
// Manages dialog state and contains AnalyticsPanel

import { CONFIG } from '../config.js';
import { Dialog } from './dialog.jsx';
import { AnalyticsPanel } from './panel.jsx';
import { getStorage } from '../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsDialog() {
    const [isOpen, setIsOpen] = React.useState(false);
    const storage = getStorage();
    
    // Load initial state from storage
    React.useEffect(() => {
        const loadState = async () => {
            if (!storage) return;
            const stored = await storage.getUI('analyticsDialogOpen', false);
            setIsOpen(stored);
        };
        loadState();
    }, [storage]);
    
    // Save state to storage when changed
    const handleOpenChange = React.useCallback(async (open) => {
        setIsOpen(open);
        if (storage) {
            await storage.setUI('analyticsDialogOpen', open);
        }
    }, [storage]);
    
    // Expose global function to open dialog
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};
        window.AdvancedAnalytics.openDialog = () => handleOpenChange(true);
        window.AdvancedAnalytics.closeDialog = () => handleOpenChange(false);
        window.AdvancedAnalytics.toggleDialog = () => handleOpenChange(!isOpen);
        
        return () => {
            delete window.AdvancedAnalytics.openDialog;
            delete window.AdvancedAnalytics.closeDialog;
            delete window.AdvancedAnalytics.toggleDialog;
        };
    }, [isOpen, handleOpenChange]);
    
    return (
        <Dialog
            id="aa-dialog-analytics"
            title="Advanced Route Analytics"
            isOpen={isOpen}
            onClose={() => handleOpenChange(false)}
        >
            <section class="overflow-hidden pb-4 rounded-lg border backdrop-blur-sm text-card-foreground mb-6">
                <AnalyticsPanel />
            </section>
        </Dialog>
    );
}