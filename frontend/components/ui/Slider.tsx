import type { ChangeEvent } from 'react';
import { cn } from '@/lib/design/cn';

interface SliderProps {
    /** Visible label, e.g. "Minutes per side". */
    label: string;
    /** Accessible name of the range input, e.g. "Increment in seconds". */
    ariaLabel?: string;
    /** The current value as shown on the right, e.g. "10 min". */
    valueText: string;
    min: number;
    max: number;
    value: number;
    step?: number;
    onChange: (value: number) => void;
    className?: string;
}

/** A labelled range input with its value and min/max captions (Main.dc.html, custom time control). */
export function Slider({ label, ariaLabel, valueText, min, max, value, step, onChange, className }: SliderProps) {
    const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));
    return (
        <label className={cn('flex flex-col gap-[6px]', className)}>
            <span className="flex justify-between text-[14px]">
                <span>{label}</span>
                <span className="font-mono font-bold text-accent">{valueText}</span>
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handle}
                aria-label={ariaLabel ?? label}
                aria-valuetext={valueText}
                className="w-full accent-accent"
            />
            <span className="flex justify-between text-[12px] text-ink-faint">
                <span>{min}</span>
                <span>{max}</span>
            </span>
        </label>
    );
}
