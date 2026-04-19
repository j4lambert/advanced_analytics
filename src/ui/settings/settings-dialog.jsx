import { Dialog }        from '../../components/dialog.jsx';
import { ToggleSwitch } from '../../components/toggle-switch.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function SettingsDialog({ isOpen, onClose, showLoadFactor, showPerformance,
                                 onToggleLoadFactor, onTogglePerformance, onTopbarSectionHover }) {
    return (
        <Dialog
            id="aa-dialog-settings"
            title="Settings"
            isOpen={isOpen}
            onClose={onClose}
            size="420px"
        >
            <div className="flex flex-col space-y-4">
                <div
                    className="aa-topbar-settings flex flex-col gap-3"
                    onMouseEnter={() => onTopbarSectionHover?.(true)}
                    onMouseLeave={() => onTopbarSectionHover?.(false)}
                >
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        Top Bar
                    </p>
                    <ToggleSwitch
                        checked={showLoadFactor}
                        onChange={onToggleLoadFactor}
                        label="System Load Factor"
                    />
                    <ToggleSwitch
                        checked={showPerformance}
                        onChange={onTogglePerformance}
                        label="Network Health Score"
                    />
                </div>
            </div>
        </Dialog>
    );
}
