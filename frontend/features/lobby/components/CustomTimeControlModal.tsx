import { customTimeControl } from '../timeControls';

const MINUTES_RANGE = { min: 1, max: 60 };
const INCREMENT_RANGE = { min: 0, max: 30 };

interface CustomTimeControlModalProps {
    customMin: number;
    customInc: number;
    onMinChange: (value: number) => void;
    onIncChange: (value: number) => void;
    onClose: () => void;
    onConfirm: () => void;
}

interface SliderProps {
    label: string;
    valueLabel: string;
    value: number;
    range: { min: number; max: number };
    onChange: (value: number) => void;
}

function Slider({ label, valueLabel, value, range, onChange }: SliderProps) {
    return (
        <div>
            <div className="flex justify-between mb-2">
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </label>
                <span className="text-sm font-medium tabular-nums text-accent">{valueLabel}</span>
            </div>
            <input
                type="range"
                min={range.min}
                max={range.max}
                step={1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                <span>{range.min}</span>
                <span>{range.max}</span>
            </div>
        </div>
    );
}

export function CustomTimeControlModal(props: CustomTimeControlModalProps) {
    const { customMin, customInc, onMinChange, onIncChange, onClose, onConfirm } = props;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border-strong)' }}
            >
                <h2 className="text-base font-medium mb-6" style={{ color: 'var(--text-primary)' }}>
                    Custom Time Control
                </h2>
                <div className="space-y-6">
                    <Slider
                        label="Minutes per side"
                        valueLabel={`${customMin} min`}
                        value={customMin}
                        range={MINUTES_RANGE}
                        onChange={onMinChange}
                    />
                    <Slider
                        label="Increment (seconds)"
                        valueLabel={`${customInc}s`}
                        value={customInc}
                        range={INCREMENT_RANGE}
                        onChange={onIncChange}
                    />
                    <div
                        className="rounded-xl p-3 text-center"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}
                    >
                        <div
                            className="text-xs uppercase tracking-wider mb-1"
                            style={{ color: 'var(--text-tertiary)' }}
                        >
                            Preview
                        </div>
                        <div className="text-xl font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {customTimeControl(customMin, customInc)}
                        </div>
                    </div>
                    <button
                        onClick={onConfirm}
                        className="w-full py-3 rounded-xl font-semibold text-sm btn-press"
                        style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                    >
                        Play with this time control
                    </button>
                </div>
            </div>
        </div>
    );
}
