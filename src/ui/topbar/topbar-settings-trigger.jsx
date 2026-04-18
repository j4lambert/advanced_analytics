// TopBarSettingsTrigger — cog button in the DashboardContent header.
// Delegates to window.AdvancedAnalytics.topBar.openSettings() so it
// never needs access to TopBar's internal state through props.

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function TopBarSettingsTrigger() {
    return (
        <button
            onClick={() => window.AdvancedAnalytics.topBar?.openSettings()}
            className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Top Bar Settings"
        >
            <icons.Settings size={16} />
        </button>
    );
}
