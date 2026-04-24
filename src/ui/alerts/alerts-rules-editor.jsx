// AlertsRulesEditor — renders inside SettingsDialog to manage alert rules.

import { Dropdown }       from '../../components/dropdown.jsx';
import { DropdownItem }   from '../../components/dropdown-item.jsx';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { ToggleSwitch }   from '../../components/toggle-switch.jsx';
import { Slider }         from '../../components/slider.jsx';
import { Dialog }         from '../../components/dialog.jsx';
import { RouteBadge }     from '../../components/route-badge.jsx';
import { Tooltip }        from '../../components/tooltip.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

const PICKER_THRESHOLD = 10;
const TOGGLER = 'aa-dropdown-toggler whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input cursor-pointer';

// ── Metric definitions ────────────────────────────────────────────────────────

const ROUTE_METRICS = [
    { value: 'loadFactor',    label: 'Load Factor' },
    { value: 'performance',   label: 'Performance' },
    { value: 'scheduleDrift', label: 'Schedule Drift' },
];

const SYSTEM_METRICS = [
    { value: 'loadFactor',         label: 'Load Factor' },
    { value: 'systemHealth',       label: 'Health Score' },
    { value: 'timetableAdherence', label: 'Timetable Adherence' },
];

function metricsFor(target) {
    return target === 'system' ? SYSTEM_METRICS : ROUTE_METRICS;
}

function sliderConfig(metric) {
    switch (metric) {
        case 'performance':
            return { min: 0.1, max: 4.0, step: 0.1, formatValue: v => v.toFixed(1) + '×' };
        case 'scheduleDrift':
            return {
                min: 30, max: 300, step: 30,
                formatValue: v => {
                    const s = Math.round(v);
                    if (s < 60) return s + 's';
                    const m = Math.floor(s / 60);
                    const r = s % 60;
                    return r === 0 ? m + 'm' : m + 'm ' + r + 's';
                },
            };
        default:
            return { min: 10, max: 100, step: 5, formatValue: v => v + '%' };
    }
}

function defaultRefValueFor(metric) {
    switch (metric) {
        case 'performance':    return 0.5;
        case 'scheduleDrift':  return 120;
        default:               return 30;
    }
}

let _uidCounter = 0;
function uid() { return `rule_${Date.now()}_${_uidCounter++}`; }

function targetLabel(target, routes) {
    if (target === 'system')    return 'System';
    if (target === 'any-route') return 'Any route';
    const route = routes.find(r => r.id === target);
    if (!route) return 'Unknown route';
    return route.bullet ? `[${route.bullet}] ${route.bullet}` : route.bullet;
}

// ── Route picker dialog (used when >10 routes) ────────────────────────────────

function RoutePickerDialog({ isOpen, onClose, routes, onSelect }) {
    const [query, setQuery] = React.useState('');
    const inputRef = React.useRef(null);

    React.useEffect(() => {
        if (isOpen) {
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const filtered = routes.filter(r =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.bullet ?? '').toLowerCase().includes(query.toLowerCase()),
    );

    return (
        <Dialog id="aa-alert-route-picker" title="Select route" isOpen={isOpen} onClose={onClose} size="400px">
            <div className="flex flex-col gap-3">
                <div className="relative">
                    <icons.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search routes…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
                <div className="flex flex-col" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {filtered.length === 0
                        ? <p className="text-xs text-muted-foreground text-center py-4">No routes found.</p>
                        : filtered.map(route => (
                            <button
                                key={route.id}
                                type="button"
                                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left transition-colors"
                                onClick={() => { onSelect(route.id); onClose(); }}
                            >
                                <RouteBadge routeId={route.id} size="1.4rem" interactive={false} />
                                <span>{route.name}</span>
                            </button>
                        ))
                    }
                </div>
            </div>
        </Dialog>
    );
}

// ── Single rule row (renders as <tr>) ─────────────────────────────────────────

function RuleRow({ rule, routes, onChange, onClone, onRemove }) {
    const [showPicker, setShowPicker] = React.useState(false);
    const manyRoutes  = routes.length > PICKER_THRESHOLD;
    const metrics     = metricsFor(rule.target);
    const sliderCfg   = sliderConfig(rule.metric);
    const metricLabel = metrics.find(m => m.value === rule.metric)?.label ?? rule.metric;

    function setField(field, value) { onChange({ ...rule, [field]: value }); }

    function handleTargetChange(newTarget) {
        if (newTarget === '__picker__') { setShowPicker(true); return; }
        const validMetrics = metricsFor(newTarget).map(m => m.value);
        const metric   = validMetrics.includes(rule.metric) ? rule.metric : metricsFor(newTarget)[0].value;
        const refValue = metric === rule.metric ? rule.refValue : defaultRefValueFor(metric);
        onChange({ ...rule, target: newTarget, metric, refValue });
    }

    function handleMetricChange(newMetric) {
        onChange({ ...rule, metric: newMetric, refValue: defaultRefValueFor(newMetric) });
    }

    const isSpecificRoute = rule.target !== 'system' && rule.target !== 'any-route';

    return (
        <tr className="group">
            {/* Target */}
            <td className="py-2 pr-2">
                <Dropdown
                    togglerClasses={TOGGLER}
                    togglerText={isSpecificRoute ? '' : targetLabel(rule.target, routes)}
                    togglerContent={isSpecificRoute
                        ? <RouteBadge routeId={rule.target} size="1.2rem" interactive={false} />
                        : null}
                    value={rule.target}
                    onChange={handleTargetChange}
                >
                    <DropdownItem value="system"    text="System" />
                    <DropdownItem value="any-route" text="Any route" />
                    {!manyRoutes && routes.map(r => (
                        <DropdownItem key={r.id} value={r.id} route={r} text={r.bullet} />
                    ))}
                    {manyRoutes && <DropdownItem value="__picker__" text="Specific route…" />}
                </Dropdown>
                {manyRoutes && showPicker && (
                    <RoutePickerDialog
                        isOpen={showPicker}
                        onClose={() => setShowPicker(false)}
                        routes={routes}
                        onSelect={routeId => handleTargetChange(routeId)}
                    />
                )}
            </td>

            {/* Metric */}
            <td className="py-2 pr-2">
                <Dropdown togglerClasses={TOGGLER} togglerText={metricLabel} value={rule.metric} onChange={handleMetricChange}>
                    {metrics.map(m => <DropdownItem key={m.value} value={m.value} text={m.label} />)}
                </Dropdown>
            </td>

            {/* Trigger */}
            <td className="py-2 pr-2">
                <ButtonsGroup value={rule.trigger} onChange={v => setField('trigger', v)}>
                    <ButtonsGroupItem value="lt" text="<" />
                    <ButtonsGroupItem value="gt" text=">" />
                </ButtonsGroup>
            </td>

            {/* Threshold */}
            <td className="py-2 pr-2" style={{ minWidth: '160px' }}>
                <Slider
                    value={rule.refValue}
                    onChange={v => setField('refValue', v)}
                    min={sliderCfg.min}
                    max={sliderCfg.max}
                    step={sliderCfg.step}
                    formatValue={sliderCfg.formatValue}
                />
            </td>

            {/* Keep (persistent) */}
            <td className="py-2 pr-2 pl-7 text-right">
                <ToggleSwitch checked={rule.persistent} onChange={() => setField('persistent', !rule.persistent)} />
            </td>

            {/* Pause */}
            <td className="py-2 pr-2 text-right">
                <ToggleSwitch checked={rule.pauseGame} onChange={() => setField('pauseGame', !rule.pauseGame)} />
            </td>

            {/* Actions */}
            <td className="py-2 text-center">
                <div className="flex items-center justify-around gap-4">
                    <Tooltip content={"Clone rule"} position="top">
                        <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={onClone} title="Clone rule" type="button">
                            <icons.Copy size={13} />
                        </button>
                    </Tooltip>
                    <Tooltip content={"Delete rule"} position="top">
                        <button className="text-muted-foreground hover:text-destructive transition-colors" onClick={onRemove} title="Remove rule" type="button">
                            <icons.X size={13} />
                        </button>
                    </Tooltip>
                </div>
            </td>
        </tr>
    );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function AlertsRulesEditor({ storage }) {
    const [rules,  setRules]  = React.useState([]);
    const [loaded, setLoaded] = React.useState(false);
    const [routes, setRoutes] = React.useState([]);
    const saveTimer = React.useRef(null);

    React.useEffect(() => {
        if (!storage || loaded) return;
        storage.get('alertRules', []).then(saved => {
            setRules(Array.isArray(saved) ? saved : []);
            setLoaded(true);
        });
    }, [storage, loaded]);

    React.useEffect(() => {
        function refresh() { setRoutes(api.gameState.getRoutes() ?? []); }
        refresh();
        const id = setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, []);

    function persistRules(next) {
        setRules(next);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { storage?.set('alertRules', next); }, 500);
    }

    function addRule() {
        persistRules([...rules, { id: uid(), target: 'system', metric: 'loadFactor', trigger: 'lt', refValue: 30, persistent: false, pauseGame: false }]);
    }

    function updateRule(idx, updated) { persistRules(rules.map((r, i) => i === idx ? updated : r)); }
    function cloneRule(idx)  { const clone = { ...rules[idx], id: uid() }; persistRules([...rules.slice(0, idx + 1), clone, ...rules.slice(idx + 1)]); }
    function removeRule(idx) { persistRules(rules.filter((_, i) => i !== idx)); }

    return (
        <div className="flex flex-col gap-2">
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Alerts</p>
            </div>

            {rules.length === 0 ? (
                <div className={`flex flex-col gap-2 items-center`}>
                    <p className="text-xs text-muted-foreground py-3 text-center">
                        No alert rules yet.
                    </p>

                    <button className="flex text-sm items-center gap-1 justify-center rounded-md p-1.5 pr-0 transition-colors hover:bg-accent hover:text-accent-foreground" onClick={addRule} type="button">
                        <icons.Plus size={16} />
                        Create new rule
                    </button>
                </div>
            ) : (
                <div>
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="text-left border-b border-border/50">
                                <th className="pb-2 pr-2 font-medium">Target</th>
                                <th className="pb-2 pr-2 font-medium">Metric</th>
                                <th className="pb-2 pr-2 font-medium">Trigger</th>
                                <th className="pb-2 pr-2 font-medium">Threshold</th>
                                <th className="pb-2 pr-2 pl-7 font-medium">Keep Visible</th>
                                <th className="pb-2 pr-2 font-medium">Pause Game</th>
                                <th className="pb-2 font-medium" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {rules.map((rule, idx) => (
                                <RuleRow
                                    key={rule.id}
                                    rule={rule}
                                    routes={routes}
                                    onChange={updated => updateRule(idx, updated)}
                                    onClone={() => cloneRule(idx)}
                                    onRemove={() => removeRule(idx)}
                                />
                            ))}
                        </tbody>
                    </table>
                    <p className="py-3 text-center">
                        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={addRule} type="button">
                            <icons.Plus size={13} />
                            Create rule
                        </button>
                    </p>
                </div>
            )}
        </div>
    );
}
