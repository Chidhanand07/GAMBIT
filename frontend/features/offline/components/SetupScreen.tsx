import { Brain, Cpu, Swords, Zap } from 'lucide-react';
import type { ColorChoice, Difficulty, DifficultyOption } from '../types';

const DIFFICULTIES: DifficultyOption[] = [
    { id: 'easy', label: 'Easy', desc: 'Plays your style — makes real mistakes', Icon: Zap },
    { id: 'medium', label: 'Medium', desc: 'Plays like you, but avoids blunders', Icon: Brain },
    { id: 'hard', label: 'Hard', desc: 'Style moves sharpened by Stockfish', Icon: Swords },
];

const COLOR_CHOICES: { id: ColorChoice; label: string; glyph: string }[] = [
    { id: 'w', label: 'White', glyph: '♔' },
    { id: 'random', label: 'Random', glyph: '⚄' },
    { id: 'b', label: 'Black', glyph: '♚' },
];

const optionStyle = (active: boolean) => ({
    background: active ? 'var(--bg-hover)' : 'var(--bg-surface)',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
});

function glyphColor(id: ColorChoice) {
    if (id === 'b') return '#111';
    return id === 'w' ? '#fff' : 'var(--text-secondary)';
}

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
    return (
        <div className="mb-6">
            <h2 className="text-sm uppercase tracking-[0.1em] text-text-tertiary font-medium mb-3">Difficulty</h2>
            <div className="grid gap-2.5">
                {DIFFICULTIES.map((d) => (
                    <button
                        key={d.id}
                        onClick={() => onChange(d.id)}
                        className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
                        style={optionStyle(value === d.id)}
                    >
                        <d.Icon size={22} className={value === d.id ? 'text-accent' : 'text-text-tertiary'} />
                        <div>
                            <div className="font-medium">{d.label}</div>
                            <div className="text-sm text-text-secondary">{d.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ColorPicker({ value, onChange }: { value: ColorChoice; onChange: (c: ColorChoice) => void }) {
    return (
        <div className="mb-8">
            <h2 className="text-sm uppercase tracking-[0.1em] text-text-tertiary font-medium mb-3">Play as</h2>
            <div className="grid grid-cols-3 gap-2.5">
                {COLOR_CHOICES.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => onChange(c.id)}
                        className="flex flex-col items-center gap-1.5 py-4 rounded-xl border transition-all"
                        style={optionStyle(value === c.id)}
                    >
                        <span
                            className="text-3xl leading-none"
                            style={{
                                color: glyphColor(c.id),
                                WebkitTextStroke: c.id === 'w' ? '1px #000' : undefined,
                            }}
                        >
                            {c.glyph}
                        </span>
                        <span className="text-sm font-medium">{c.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

interface SetupScreenProps {
    difficulty: Difficulty;
    onDifficulty: (d: Difficulty) => void;
    colorChoice: ColorChoice;
    onColorChoice: (c: ColorChoice) => void;
    onStart: () => void;
}

export function SetupScreen({ difficulty, onDifficulty, colorChoice, onColorChoice, onStart }: SetupScreenProps) {
    return (
        <div className="max-w-2xl mx-auto px-4 py-10 text-text-primary">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                    <Cpu size={26} className="text-accent" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold">Play MAVERICK</h1>
                    <p className="text-text-secondary text-sm">Your personal style bot — trained on your own games.</p>
                </div>
            </div>

            <DifficultyPicker value={difficulty} onChange={onDifficulty} />
            <ColorPicker value={colorChoice} onChange={onColorChoice} />

            <button
                onClick={onStart}
                className="w-full h-12 rounded-xl font-semibold btn-press transition-colors"
                style={{ background: 'var(--accent)', color: '#0F0D0B' }}
            >
                Start Game
            </button>
        </div>
    );
}
