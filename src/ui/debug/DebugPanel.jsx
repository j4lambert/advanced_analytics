import { showChangelog } from '../changelog/ChangelogToast.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function DebugPanel() {
    return (
        <div className="flex flex-col gap-4 p-4 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono font-medium">{__MOD_VERSION__}</span>
            </div>
            <button
                onClick={showChangelog}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
                {React.createElement(icons.Sparkles, { size: 14 })}
                Show changelog toast
            </button>
        </div>
    );
}
