// GuideDialog component
// Inline user guide with sidebar navigation and scrollable content

import { Dialog } from '../../components/dialog.jsx';
import { CONFIG } from "../../config";

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AboutDialog({ isOpen, onClose }) {

    return (
        <Dialog
            id="aa-about-dialog"
            title="About"
            size={400}
            isOpen={isOpen}
            onClose={onClose}
            backdropClasses="bg-black"
        >
            <p class={'font-mono text-muted-foreground pt-6 pb-3 text-center'}>
                <div class="font-bold text-lg text-foreground">Advanced Analytics</div>
                <div class="mb-4"><span className={'text-sm font-bold'}>v{CONFIG.VERSION}</span></div>
                <div className={'flex flex-col gap-2 items-center pb-6 pt-2 text-xs'}>
                    <icons.Github size={16}/>
                    <span>github.com/stefanorigano/advanced_analytics</span>
                </div>
                <div class="pt-4 text-xs">by Steno</div>
            </p>

        </Dialog>
    );
}
