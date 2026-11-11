import type { ReactNode } from 'react';
import { Zap, Flame, Timer, BookOpen } from 'lucide-react';
import type { ChallengeColor } from '../types';

interface TimeControlOption {
    id: string;
    label: string;
    category: string;
    icon: ReactNode;
}

const TIME_CONTROLS: TimeControlOption[] = [
    { id: '1', label: '1 min', category: 'Bullet', icon: <Zap size={16} strokeWidth={1.5} /> },
    { id: '2', label: '2 min', category: 'Bullet', icon: <Zap size={16} strokeWidth={1.5} /> },
    { id: '3', label: '3 min', category: 'Blitz', icon: <Flame size={16} strokeWidth={1.5} /> },
    { id: '5', label: '5 min', category: 'Blitz', icon: <Flame size={16} strokeWidth={1.5} /> },
    { id: '10', label: '10 min', category: 'Rapid', icon: <Timer size={16} strokeWidth={1.5} /> },
    { id: '15', label: '15 min', category: 'Rapid', icon: <Timer size={16} strokeWidth={1.5} /> },
    { id: '30', label: '30 min', category: 'Classical', icon: <BookOpen size={16} strokeWidth={1.5} /> },
];

const COLORS: readonly ChallengeColor[] = ['white', 'random', 'black'];
const COLOR_LABELS: Record<ChallengeColor, string> = { white: '♔ White', black: '♚ Black', random: '⊕ Random' };

const SELECTED = 'border-accent bg-accent/10 text-accent';

export function TimeControlPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    return (
        <div>
            <p className="text-sm font-medium text-text-secondary mb-3">Time Control</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {TIME_CONTROLS.map((tc) => (
                    <button
                        key={tc.id}
                        onClick={() => onChange(tc.id)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                            value === tc.id
                                ? SELECTED
                                : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                        }`}
                    >
                        <span className={value === tc.id ? 'text-accent' : 'text-text-tertiary'}>{tc.icon}</span>
                        {tc.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function RatedToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Rated Game</span>
            <button
                onClick={onToggle}
                className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-border'}`}
            >
                <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
                />
            </button>
        </div>
    );
}

export function ColorPicker({ value, onChange }: { value: ChallengeColor; onChange: (c: ChallengeColor) => void }) {
    return (
        <div>
            <p className="text-sm font-medium text-text-secondary mb-3">I play as</p>
            <div className="flex gap-2">
                {COLORS.map((c) => (
                    <button
                        key={c}
                        onClick={() => onChange(c)}
                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors capitalize ${
                            value === c ? SELECTED : 'border-border text-text-secondary hover:border-border-strong'
                        }`}
                    >
                        {COLOR_LABELS[c]}
                    </button>
                ))}
            </div>
        </div>
    );
}
