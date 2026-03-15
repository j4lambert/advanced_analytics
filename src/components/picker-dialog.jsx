// PickerDialog Component
// Replaces a <Dropdown> when the item list is large enough to warrant a full
// dialog with search and sortable columns.
//
// API surface mirrors <Dropdown> so callers can swap one for the other by
// changing a single JSX tag — togglerClasses, togglerIcon, togglerText, value,
// onChange, and multiselect all behave identically.
//
// COLUMNS
// Each column descriptor: { key, label, render, sortFn, width }
//   key     — unique string identifier
//   label   — header cell text (can be '')
//   render  — (item) => ReactNode  called for every table cell in that column
//   sortFn  — (a, b) => number     omit or set null for non-sortable column
//   width   — CSS width string, e.g. '80px'  (optional)
//
// ITEMS
// Each item must have at least { id: string, name: string }.
// name is used by the default searchFn; pass a custom searchFn to override.
//
// SELECTION
// multiselect=true  → value is string[]  → onChange receives string[]
// multiselect=false → value is string    → onChange receives string
//
// DRAFT STATE
// Changes are staged locally.  Confirm applies them; Discard (or closing the
// dialog) discards them, reverting to the value at open time.
//
// THRESHOLD HELPER
// Import PICKER_THRESHOLD to keep the threshold consistent across all callers.

import { Dialog } from './dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Public constant ───────────────────────────────────────────────────────────
export const PICKER_THRESHOLD = 10;

// ── Component ────────────────────────────────────────────────────────────────
export function PickerDialog({
    // Toggler — same props as <Dropdown>
    togglerClasses  = '',
    togglerTitle    = '',
    togglerIcon: TogglerIcon = null,
    togglerText     = '',
    // Dialog header
    title           = 'Select',
    dialogSize      = '640px',
    // Data
    items           = [],   // [{ id, name, ...extras }]
    value           = [],   // string[] (multiselect) | string (single)
    onChange        = () => {},
    multiselect     = true,
    // Table columns (see header comment)
    columns         = [],
    // Optional custom search predicate: (item, query) => boolean
    searchFn        = null,
}) {
    const [isOpen, setIsOpen]   = React.useState(false);
    const [draft,  setDraft]    = React.useState([]);
    const [search, setSearch]   = React.useState('');
    const [sort,   setSort]     = React.useState({ key: null, dir: 'asc' });

    const searchInputRef = React.useRef(null);

    // ── Open / close ─────────────────────────────────────────────────────────
    const open = () => setIsOpen(true);
    const close = () => setIsOpen(false);

    // Initialise draft + reset UI when dialog opens.
    React.useEffect(() => {
        if (!isOpen) return;
        setDraft(Array.isArray(value) ? [...value] : value ? [value] : []);
        setSearch('');
        // Default sort: name column if available, else first sortable column
        const nameCol = columns.find(c => c.key === 'name' && c.sortFn);
        const fallback = columns.find(c => c.sortFn);
        const defaultCol = nameCol || fallback;
        if (defaultCol) setSort({ key: defaultCol.key, dir: 'asc' });
        // Focus search input after portal paints
        setTimeout(() => searchInputRef.current?.focus(), 50);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Filtering + sorting ──────────────────────────────────────────────────
    const defaultSearch = (item, q) =>
        (item.name ?? '').toLowerCase().includes(q.toLowerCase());
    const activeSFn = searchFn || defaultSearch;

    const filteredItems = React.useMemo(() => {
        let result = search.trim()
            ? items.filter(item => activeSFn(item, search.trim()))
            : items;

        if (sort.key) {
            const col = columns.find(c => c.key === sort.key);
            if (col?.sortFn) {
                result = [...result].sort((a, b) => {
                    const v = col.sortFn(a, b);
                    return sort.dir === 'asc' ? v : -v;
                });
            }
        }
        return result;
    }, [items, search, sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Header checkbox ──────────────────────────────────────────────────────
    const visibleIds        = filteredItems.map(i => i.id);
    const selectedVisible   = draft.filter(id => visibleIds.includes(id));
    const allVisSelected    = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
    const someVisSelected   = selectedVisible.length > 0 && !allVisSelected;

    const headerCheckRef = React.useCallback(el => {
        if (el) el.indeterminate = someVisSelected;
    }, [someVisSelected]);

    const toggleSelectAll = () => {
        if (allVisSelected) {
            setDraft(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            setDraft(prev => {
                const set = new Set(prev);
                visibleIds.forEach(id => set.add(id));
                return Array.from(set);
            });
        }
    };

    // ── Row toggle ───────────────────────────────────────────────────────────
    const toggleItem = (id) => {
        if (!multiselect) {
            setDraft([id]);
        } else {
            setDraft(prev =>
                prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
            );
        }
    };

    // ── Column header sort ───────────────────────────────────────────────────
    const handleSort = (key) => {
        setSort(prev =>
            prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' }
        );
    };

    // ── Confirm / Discard ────────────────────────────────────────────────────
    const handleConfirm = () => {
        onChange(multiselect ? draft : (draft[0] ?? null));
        close();
    };
    const handleDiscard = () => close();

    // ── Toggler ──────────────────────────────────────────────────────────────
    const togglerInner = [
        TogglerIcon && <TogglerIcon key="icon" className="w-4 h-4" />,
        togglerText  && <span key="text">{togglerText}</span>,
        <span key="caret" className="text-sm opacity-70">
            <icons.ChevronDown size={12} />
        </span>,
    ].filter(Boolean);

    const colSpan = columns.length + (multiselect ? 1 : 0);

    // ── Sort indicator ───────────────────────────────────────────────────────
    const SortIcon = ({ colKey, sortFn }) => {
        if (!sortFn) return null;
        if (sort.key !== colKey) {
            return <icons.ChevronsUpDown size={12} className="opacity-30 inline-block ml-1" />;
        }
        return sort.dir === 'asc'
            ? <icons.ArrowUp   size={12} className="inline-block ml-1" />
            : <icons.ArrowDown size={12} className="inline-block ml-1" />;
    };

    return (
        <div className="aa-picker-wrapper">
            {/* Toggler — identical appearance to <Dropdown> */}
            <button
                className={`aa-dropdown-toggler whitespace-nowrap ${togglerClasses}`}
                title={togglerTitle}
                onClick={open}
                type="button"
            >
                {togglerInner}
            </button>

            <Dialog
                id="aa-picker-dialog"
                title={title}
                isOpen={isOpen}
                onClose={handleDiscard}
                size={dialogSize}
                noPadding={true}
            >
                {/* ── Search bar ─────────────────────────────────────── */}
                <div className="px-4 py-3 border-b bg-background">
                    <div className="relative">
                        <icons.Search
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                        />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-full pl-8 pr-7 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                title="Clear search"
                            >
                                <icons.X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Table ──────────────────────────────────────────── */}
                <div className="overflow-y-auto" style={{ height: 'min(400px, 55vh)' }}>
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-background z-10 border-b">
                            <tr>
                                {multiselect && (
                                    <th className="w-10 px-3 py-2 text-left">
                                        <input
                                            type="checkbox"
                                            ref={headerCheckRef}
                                            checked={allVisSelected}
                                            onChange={toggleSelectAll}
                                            className="cursor-pointer"
                                        />
                                    </th>
                                )}
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap${col.sortFn ? ' cursor-pointer hover:text-foreground select-none' : ''}`}
                                        style={col.width ? { width: col.width } : undefined}
                                        onClick={col.sortFn ? () => handleSort(col.key) : undefined}
                                    >
                                        {col.label}
                                        <SortIcon colKey={col.key} sortFn={col.sortFn} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={colSpan}
                                        className="px-3 py-10 text-center text-xs text-muted-foreground"
                                    >
                                        No results
                                    </td>
                                </tr>
                            ) : filteredItems.map(item => {
                                const isSelected = draft.includes(item.id);
                                return (
                                    <tr
                                        key={item.id}
                                        className={`border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/50${isSelected ? ' bg-primary/10 outline' : ''}`}
                                        onClick={() => toggleItem(item.id)}
                                    >
                                        {multiselect && (
                                            <td
                                                className="w-10 px-3 py-2"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleItem(item.id)}
                                                    className="cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        {columns.map(col => (
                                            <td
                                                key={col.key}
                                                className="px-3 py-2"
                                                style={col.width ? { width: col.width } : undefined}
                                            >
                                                {col.render(item)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Footer ────────────────────────────────────────── */}
                <div className="px-4 py-3 border-t flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {draft.length} selected
                        {search.trim() ? ` · ${filteredItems.length} shown` : ''}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDiscard}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-background border text-foreground hover:bg-accent transition-colors"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-background border text-foreground hover:bg-primary/90 hover:text-secondary transition-colors"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
