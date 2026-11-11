import type { MouseEvent, ReactNode } from 'react';
import { BookOpen, Calendar, Flame, Settings, Timer, Zap } from 'lucide-react';
import type { LobbyTimeControlId } from '@/types/timeControl';
import { BASE_TIME_CONTROLS, TIME_CONTROL_META, customTimeControl, type LobbyTimeControl } from '../timeControls';

const TIME_CONTROL_ICONS: Record<LobbyTimeControlId, ReactNode> = {
    bullet: <Zap size={28} strokeWidth={1.5} />,
    blitz: <Flame size={28} strokeWidth={1.5} />,
    rapid: <Timer size={28} strokeWidth={1.5} />,
    classical: <BookOpen size={28} strokeWidth={1.5} />,
    custom: <Settings size={28} strokeWidth={1.5} />,
    daily: <Calendar size={28} strokeWidth={1.5} />,
};

interface TimeControlPickerProps {
    selectedTc: LobbyTimeControlId;
    customMin: number;
    customInc: number;
    onSelect: (id: LobbyTimeControlId) => void;
    /** Clicking the Custom card opens the slider modal instead of selecting it. */
    onOpenCustom: () => void;
}

function hoverIn(e: MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget as HTMLDivElement;
    el.style.borderColor = 'var(--border-accent)';
    el.style.transform = 'translateY(-2px)';
    el.style.boxShadow = '0 4px 16px var(--accent-glow)';
}

function hoverOut(e: MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget as HTMLDivElement;
    el.style.borderColor = 'var(--border)';
    el.style.transform = '';
    el.style.boxShadow = '';
}

interface CardProps {
    tc: LobbyTimeControl;
    isSelected: boolean;
    timeLabel: string;
    onClick: () => void;
}

function TimeControlCard({ tc, isSelected, timeLabel, onClick }: CardProps) {
    const meta = TIME_CONTROL_META[tc.id] ?? { subtitle: '' };
    return (
        <div
            onClick={onClick}
            className="relative rounded-xl p-4 cursor-pointer transition-all duration-150 select-none"
            style={{
                background: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)',
                border: isSelected ? '1.5px solid var(--accent)' : '0.5px solid var(--border)',
            }}
            onMouseEnter={(e) => {
                if (!isSelected) hoverIn(e);
            }}
            onMouseLeave={(e) => {
                if (!isSelected) hoverOut(e);
            }}
        >
            <div className="flex items-center justify-between mb-3">
                <span className={isSelected ? 'text-accent' : 'text-text-secondary'}>{TIME_CONTROL_ICONS[tc.id]}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {timeLabel}
                </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {tc.label}
                </div>
                {meta.badge && (
                    <span
                        className="text-[10px] uppercase px-1.5 py-0.5 rounded text-accent"
                        style={{ background: 'var(--accent-dim)', border: '0.5px solid var(--border-accent)' }}
                    >
                        {meta.badge}
                    </span>
                )}
            </div>
            <div className="text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                {meta.subtitle}
            </div>
        </div>
    );
}

export function TimeControlPicker({
    selectedTc,
    customMin,
    customInc,
    onSelect,
    onOpenCustom,
}: TimeControlPickerProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            {BASE_TIME_CONTROLS.map((tc) => {
                const isCustom = tc.id === 'custom';
                return (
                    <TimeControlCard
                        key={tc.id}
                        tc={tc}
                        isSelected={selectedTc === tc.id}
                        timeLabel={
                            isCustom && selectedTc === 'custom' ? customTimeControl(customMin, customInc) : tc.time
                        }
                        onClick={() => (isCustom ? onOpenCustom() : onSelect(tc.id))}
                    />
                );
            })}
        </div>
    );
}
