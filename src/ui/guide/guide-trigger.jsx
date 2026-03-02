// StorageTrigger component
// Settings button that opens storage management dialog

import { GuideDialog } from './guide-dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function GuideTrigger() {
    const [isOpen, setIsOpen] = React.useState(false);
    
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground mr-auto"
                title="User Guide"
            >
                <icons.BookText size={16} />
                <span className="ml-2 text-xs">Guide</span>
            </button>
            
            <GuideDialog
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
            />
        </>
    );
}
