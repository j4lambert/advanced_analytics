// StorageTrigger component
// Settings button that opens storage management dialog

import { StorageDialog } from './storage-dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function StorageTrigger() {
    const [isOpen, setIsOpen] = React.useState(false);
    
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                title="Storage Settings"
            >
                <icons.DatabaseZap size={16} />
            </button>
            
            <StorageDialog
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
            />
        </>
    );
}
