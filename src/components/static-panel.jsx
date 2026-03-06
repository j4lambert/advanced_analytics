// Generic Dialog Component
// Handles backdrop, animations, and cleanup

import { Portal } from '../hooks/portal.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function StaticPanel({
    id,
    title,
    children,
    isOpen,
    onClose,
    staticPanelCustomClasses,
    size,
}) {
    const [state, setState] = React.useState('open');
    const staticPanelDefaultClasses = "aa-static-panel bg-black/50 rounded-lg overflow-hidden fixed flex flex-col z-[100] border sm:rounded-lg select-none max-w-[95vw] max-h-[90vh] p-0 right-0 mr-2 top-0 mt-2 bottom-24"
    const staticPanelBodyClasses = "aa-static-panel-body bg-background dark:bg-background/50 backdrop-blur-md px-6 py-4 overflow-y-auto scrollbar-thin"
    // Reset state to 'open' when dialog is opened
    React.useEffect(() => {
        if (isOpen) {
            setState('open');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <Portal>
            <>
                {/* Dialog */}
                <div
                    id={`${id}-static-panel`}
                    role="dialog"
                    data-state={state}
                    className={`${staticPanelDefaultClasses} ${staticPanelCustomClasses}`}
                    tabIndex="-1"
                    style={{ pointerEvents: 'auto', width: size }}
                >
                    <div className="aa-static-panel-header bg-primary-foreground border-b border-primary/15">
                        <div className="flex items-center justify-between h-9 min-h-9 text-center py-1 px-4">
                            <h2 className="text-sm font-semibold leading-none tracking-tight">
                                {title}
                            </h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-6 w-6 p-0.5 ml-auto"
                            >
                                <icons.X size={16} />
                                <span className="sr-only">Close</span>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className={staticPanelBodyClasses}>
                        {children}
                    </div>
                </div>
            </>
        </Portal>
    );
}
