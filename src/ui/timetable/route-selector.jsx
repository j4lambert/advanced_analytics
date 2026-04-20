// RouteSelector — multi-select for filtering routes in the heatmap.
// Uses a Dropdown for small route lists and a PickerDialog for larger ones.

import { Dropdown }                      from '../../components/dropdown.jsx';
import { DropdownItem }                  from '../../components/dropdown-item.jsx';
import { PickerDialog, PICKER_THRESHOLD } from '../../components/picker-dialog.jsx';
import { RouteBadge }                    from '../../components/route-badge.jsx';

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

    const togglerClasses = "flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent transition-colors";

    if (routes.length > PICKER_THRESHOLD) {
        const items = routes.map(r => ({ id: r.routeId, name: r.routeName }));
        const columns = [
            {
                key:    'badge',
                label:  '',
                render: item => <RouteBadge routeId={item.id} interactive={false} size="1.5rem" />,
                sortFn: null,
                width:  '44px',
            },
            {
                key:    'name',
                label:  'Route',
                render: item => <span className="text-sm">{item.name}</span>,
                sortFn: (a, b) => a.name.localeCompare(b.name),
            },
        ];

        return (
            <PickerDialog
                title="Select Routes"
                togglerText={label}
                togglerClasses={togglerClasses}
                multiselect={true}
                value={selectedIds}
                onChange={onChange}
                items={items}
                columns={columns}
            />
        );
    }

    return (
        <Dropdown
            multiselect
            value={selectedIds}
            onChange={onChange}
            togglerClasses={togglerClasses}
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
