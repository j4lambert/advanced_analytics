// GuideTrigger component
// User Guide button that opens the relative dialog

import { AboutDialog } from './about-dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AboutTrigger() {
    const [isOpen, setIsOpen] = React.useState(false);
    
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center text-xs justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                title="About"
            >
                About
            </button>
            
            <AboutDialog
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
            />
        </>
    );
}
