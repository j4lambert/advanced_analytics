const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function SettingsDialogTrigger() {
    return (
        <button
            onClick={() => window.AdvancedAnalytics.topBar?.openSettings()}
            className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Settings"
        >
            <icons.Settings size={16} />
        </button>
    );
}
