// StorageTrigger component
// Settings button that opens storage management dialog

import { StorageDialog } from './storage-dialog.jsx';
import { getCurrentSaveName } from '../../core/lifecycle.js';
import { Tooltip } from "../../components/tooltip";
import { Storage } from "../../core/storage";
import { CONFIG } from "../../config";

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function StorageTrigger() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [showUnsavedWarning,  setShowUnsavedWarning]  = React.useState(false);

    // ── Load on open ────────────────────────────────────────────────────────
    React.useEffect(() => {
        void loadStorageData();
    },[]);

    const loadStorageData = async () => {
        try {
            const saves = await Storage.getAllSaves();
            const current = getCurrentSaveName();

            // Show warning if there's no active save name OR if the active
            // save name hasn't been committed to IDB yet (game not saved yet)
            setShowUnsavedWarning(!current || !saves[current]);
        } catch (err) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to load storage data:`, err);
        }
    }
    
    const currentSaveName = getCurrentSaveName();
    const warningTip = (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
            <span className="font-semibold pb-2">No save detected</span>
            <span>Temporarily storing data in:</span>
            <span className={`font-mono`}>${currentSaveName}</span>
            <span className="font-semibold py-2">Save your game.</span>
        </div>
    );
    const okTip = (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
            <span className="font-semibold">Data associated to save:</span>
            <span className={`font-mono text-xs text-blue-500 py-2`}>${currentSaveName}.</span>
        </div>
    );
    const tooltipText = showUnsavedWarning ? warningTip : okTip;

    return (
        <>
            <Tooltip content={tooltipText}>
                <button
                    onClick={() => setIsOpen(true)}
                    className={`inline-flex items-center justify-center rounded-md p-1.5 pr-0 transition-colors hover:bg-accent hover:text-accent-foreground`}
                    title="Storage Settings"
                >
                    { !showUnsavedWarning && !api.gameState.isPaused() && (
                        <icons.DatabaseZap size={16} className={`animate-pulse text-green-600 dark:text-green-400`} />
                    )}
                    { !showUnsavedWarning && api.gameState.isPaused() && (
                        <icons.Database size={16} />
                    )}
                    { showUnsavedWarning && (
                        <icons.Database size={16} className={`text-muted-foreground`} />
                    )}
                </button>
            </Tooltip>

            <StorageDialog
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
            />
        </>
    );
}
