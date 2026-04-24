import { Dialog }        from '../../components/dialog.jsx';
import { ToggleSwitch } from '../../components/toggle-switch.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function SettingsDialog({ isOpen, onClose, showLoadFactor, showPerformance, showAdherence,
                                 onToggleLoadFactor, onTogglePerformance, onToggleAdherence, onTopbarSectionHover }) {
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
                        label={<span className="flex items-center gap-2"><icons.Gauge size={14} className="shrink-0 text-muted-foreground" />System Load Factor</span>}
                    />
                    <ToggleSwitch
                        checked={showPerformance}
                        onChange={onTogglePerformance}
                        label={<span className="flex items-center gap-2"><icons.HeartPulse size={14} className="shrink-0 text-muted-foreground" />Network Health Score</span>}
                    />
                    <ToggleSwitch
                        checked={showAdherence}
                        onChange={onToggleAdherence}
                        label={<span className="flex items-center gap-2"><icons.CalendarClock size={14} className="shrink-0 text-muted-foreground" />Schedule Adherence</span>}
                    />
                </div>
            </div>
        </Dialog>
    );
}
