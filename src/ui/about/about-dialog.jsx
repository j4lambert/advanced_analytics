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
            size={600}
            isOpen={isOpen}
            onClose={onClose}
            backdropClasses="bg-black"
        >
            <div class={'font-mono text-muted-foreground pt-6 pb-3 text-center'}>
                <div class="font-bold text-lg text-foreground">Advanced Analytics</div>
                <div class="mb-4">
                    <span className={'text-sm font-bold'}>v{CONFIG.VERSION} -</span> <span class="text-xs">by Steno</span>
                </div>
                <div className={'flex gap-2 items-center justify-center pt-2 text-xs'}>
                    <icons.Github size={16}/>
                    <span>On Github: github.com/stefanorigano/advanced_analytics</span>
                </div>
                <div className={'flex gap-2 items-center justify-center pb-6 pt-2 text-xs'}>
                    <icons.TrainTrack size={16}/>
                    <span>On Railyard: "Advanced Analytics"</span>
                </div>
            </div>
            <hr/>
            <div class={'text-muted-foreground pt-6 pb-3 text-center text-sm'}>
                <div class="font-semibold text-foreground mb-2">Special thanks:</div>
                <div className={'italic text-muted-foreground mb-1'}>
                    spz213, sanccio, Tom G, DeeCee, R, 吹雪 牧<br/>
                </div>
                <div className={'italic mb-4'}>
                    ...and everyone who reported bugs, tested builds, proposed improvements and helped reverse-engineer the game's formulas.
                </div>
                <div class="italic text-muted-foreground mb-2">
                    A huge thanks to Colin and the SubwayBuilder team for<br/> building something worth modding<br/>
                </div>
                ❤️
            </div>

        </Dialog>
    );
}
