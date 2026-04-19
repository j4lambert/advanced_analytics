const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function ToggleSwitch({ checked, onChange, label }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative inline-flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    className="sr-only"
                />
                <div className={`w-8 h-4 border-2 border-transparent rounded-full transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:bg-primary/80 ${checked ? "bg-primary" : "bg-input"}`} />
                <div
                    className={`absolute top-0.5 w-3 h-3 bg-background rounded-full transition-all ${checked ? "" : "left-0.5"}`}
                    style={{ right: checked ? "0.125rem" : "auto" }}
                />
            </div>
            <span className="text-sm">{label}</span>
        </label>
    );
}
