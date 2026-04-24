const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * Generic range slider with a value label.
 *
 * Props:
 *   value        - current numeric value
 *   onChange     - (newValue: number) => void
 *   min          - minimum value
 *   max          - maximum value
 *   step         - step increment
 *   formatValue  - (value: number) => string  e.g. v => v + '%'
 */
export function Slider({ value, onChange, min, max, step, formatValue }) {
    const pct = ((value - min) / (max - min)) * 100;

    return (
        <div className="flex items-center gap-1.5 w-full">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="aa-slider flex-1 h-1.5 appearance-none rounded-full cursor-pointer"
                style={{
                    background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--border)) ${pct}%)`,
                }}
            />
            <span className="whitespace-nowrap text-xs font-mono tabular-nums w-10 text-right shrink-0">
                {formatValue(value)}
            </span>
        </div>
    );
}
