import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import type { ChallengeColor } from '../types';

/** Base minutes the challenge can be sent with (the server's time-control rules apply). */
const TIME_CONTROLS = ['1', '2', '3', '5', '10', '15', '30'].map((id) => ({ id, label: `${id} min` }));

const COLORS: { id: ChallengeColor; label: string }[] = [
    { id: 'white', label: '♔ White' },
    { id: 'random', label: '⊕ Random' },
    { id: 'black', label: '♚ Black' },
];

/** One option row of the card, as the Settings rows: label on the left, the control on the right. */
function OptionRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-4 border-t-1 border-line-subtle px-7 py-[18px]">
            <span className="flex-[1_1_160px] font-semibold">{label}</span>
            {children}
        </div>
    );
}

export function TimeControlPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    return (
        <OptionRow label="Time Control">
            <Tabs label="Time Control" tone="accent" items={TIME_CONTROLS} value={value} onChange={onChange} />
        </OptionRow>
    );
}

export function RatedToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
        <OptionRow label="Rated Game">
            <Switch label="Rated Game" checked={value} onChange={onToggle} />
        </OptionRow>
    );
}

export function ColorPicker({ value, onChange }: { value: ChallengeColor; onChange: (c: ChallengeColor) => void }) {
    return (
        <OptionRow label="I play as">
            <Tabs label="I play as" tone="accent" items={COLORS} value={value} onChange={onChange} />
        </OptionRow>
    );
}
