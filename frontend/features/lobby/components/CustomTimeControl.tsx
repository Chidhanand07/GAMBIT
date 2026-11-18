import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { customTimeControl } from '../timeControls';

export const CUSTOM_MINUTES = { min: 1, max: 60 } as const;
export const CUSTOM_INCREMENT = { min: 0, max: 30 } as const;

interface CustomTimeControlProps {
    minutes: number;
    increment: number;
    onMinutes: (value: number) => void;
    onIncrement: (value: number) => void;
    onPlay: () => void;
}

/** Sliders, preview and "Play with this time control" (shown while Custom is selected). */
export function CustomTimeControl({ minutes, increment, onMinutes, onIncrement, onPlay }: CustomTimeControlProps) {
    return (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-5 border-accent">
            <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-[18px]">
                <span className="font-display text-[20px] font-bold">Custom time control</span>
                <Slider
                    label="Minutes per side"
                    valueText={`${minutes} min`}
                    min={CUSTOM_MINUTES.min}
                    max={CUSTOM_MINUTES.max}
                    value={minutes}
                    onChange={onMinutes}
                />
                <Slider
                    label="Increment (seconds)"
                    ariaLabel="Increment in seconds"
                    valueText={`${increment}s`}
                    min={CUSTOM_INCREMENT.min}
                    max={CUSTOM_INCREMENT.max}
                    value={increment}
                    onChange={onIncrement}
                />
            </div>
            <div className="flex flex-[0_1_240px] flex-col gap-3">
                <div className="flex flex-col items-center rounded-16 border-1 border-line bg-bg-base p-[18px]">
                    <span className="text-[13px] text-ink-muted">Preview</span>
                    <span className="font-mono text-[44px] font-bold tracking-[-0.03em]">
                        {customTimeControl(minutes, increment)}
                    </span>
                </div>
                <Button size="xl" onClick={onPlay} className="flex px-[6px]">
                    Play with this time control
                </Button>
            </div>
        </Card>
    );
}
