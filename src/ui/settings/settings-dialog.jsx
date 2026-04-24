import { Dialog }             from '../../components/dialog.jsx';
import { ToggleSwitch }       from '../../components/toggle-switch.jsx';
import { AlertsRulesEditor }  from '../alerts/alerts-rules-editor.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function SettingsDialog({ isOpen, onClose, storage,
                                 showLoadFactor, showPerformance, showAdherence,
                                 onToggleLoadFactor, onTogglePerformance, onToggleAdherence,
                                 showAlertsButton, onToggleAlertsButton,
                                 onTopbarSectionHover }) {
    return (
        <Dialog
            id="aa-dialog-settings"
            title="Settings"
            isOpen={isOpen}
            onClose={onClose}
            size="820px"
        >
            <div className="flex flex-col space-y-5">

                {/* Top Bar section */}
                <div
                    className="aa-topbar-settings flex flex-col gap-3"
                    onMouseEnter={() => onTopbarSectionHover?.(true)}
                    onMouseLeave={() => onTopbarSectionHover?.(false)}
                >
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        Top Bar
                    </p>
                    <div className={'grid grid-cols-2 gap-4'}>
                        <ToggleSwitch
                            checked={showLoadFactor}
                            onChange={onToggleLoadFactor}
                            label={<span className="flex items-center gap-2"><icons.Gauge size={14}
                                                                                          className="shrink-0 text-muted-foreground"/>System Load Factor</span>}
                        />
                        <ToggleSwitch
                            checked={showPerformance}
                            onChange={onTogglePerformance}
                            label={<span className="flex items-center gap-2"><icons.HeartPulse size={14}
                                                                                               className="shrink-0 text-muted-foreground"/>Network Health Score</span>}
                        />
                        <ToggleSwitch
                            checked={showAdherence}
                            onChange={onToggleAdherence}
                            label={<span className="flex items-center gap-2"><icons.CalendarClock size={14}
                                                                                                  className="shrink-0 text-muted-foreground"/>Schedule Adherence</span>}
                        />
                        <ToggleSwitch
                            checked={showAlertsButton}
                            onChange={onToggleAlertsButton}
                            label={<span className="flex items-center gap-2"><icons.Bell size={14}
                                                                                         className="shrink-0 text-muted-foreground"/>Alerts toggle</span>}
                        />
                    </div>
                </div>

                <div className="h-px bg-border/50" />

                {/* Alerts section */}
                <AlertsRulesEditor storage={storage} />

            </div>
        </Dialog>
    );
}
