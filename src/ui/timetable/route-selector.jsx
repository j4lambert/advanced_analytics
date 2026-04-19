// RouteSelector — multi-select dropdown for filtering routes in the heatmap.
// Wraps the existing Dropdown component with multiselect mode.

import { Dropdown }     from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function RouteSelector({ routes, selectedIds, onChange }) {
    const count = selectedIds.length;
    const total = routes.length;
    const label = count === total
        ? 'All routes'
        : count === 0
        ? 'No routes'
        : `${count} / ${total} routes`;

    return (
        <Dropdown
            multiselect
            value={selectedIds}
            onChange={onChange}
            togglerClasses="flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
            togglerContent={<span>{label}</span>}
        >
            {routes.map(r => (
                <DropdownItem
                    key={r.routeId}
                    value={r.routeId}
                    route={{ id: r.routeId }}
                />
            ))}
        </Dropdown>
    );
}
