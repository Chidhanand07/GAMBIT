'use client';

import { useState } from 'react';
import { cn } from '@/lib/design/cn';
import { SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { SpeedBucket } from '@/types/timeControl';
import { TIME_CONTROLS, type UserSettings } from '../model';
import { PreviewCard } from './PreviewCard';

const CLOCKS: Record<SpeedBucket, string> = { bullet: '1 min', blitz: '3 min', rapid: '10 min', classical: '30 min' };
const PROMOTIONS = ['Queen', 'Rook', 'Bishop', 'Knight'] as const;
const CAPTION = 'text-[13px] text-ink-muted';

function promoText(promo: string): string {
    if (promo === 'auto') return 'Promoted to a queen automatically.';
    if (promo === 'pick') return 'Choose a piece…';
    return promo ? `You chose a ${promo.toLowerCase()}.` : '';
}

function Promotion({ autoQueen }: { autoQueen: boolean }) {
    const [promo, setPromo] = useState('');
    return (
        <div className="flex flex-col gap-2">
            <span className={CAPTION}>Pawn reaches the last rank</span>
            <button
                type="button"
                onClick={() => setPromo(autoQueen ? 'auto' : 'pick')}
                className="min-h-[44px] rounded-pill border-1.5 border-line-muted bg-transparent text-[15px] font-semibold text-ink"
            >
                Promote pawn
            </button>
            {promo === 'pick' && (
                <div className="flex gap-[6px]">
                    {PROMOTIONS.map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setPromo(p)}
                            className="min-h-[44px] flex-1 rounded-12 border-0 bg-ink font-bold text-on-accent"
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}
            <span className="min-h-[20px] text-[14px] text-success-ink">{promoText(promo)}</span>
        </div>
    );
}

function Resign({ confirm }: { confirm: boolean }) {
    const [state, setState] = useState<'' | 'confirm' | 'done'>('');
    return (
        <div className="flex flex-col gap-2">
            <span className={CAPTION}>Resign</span>
            <button
                type="button"
                onClick={() => setState(confirm ? 'confirm' : 'done')}
                className="min-h-[44px] rounded-pill border-1.5 border-danger bg-transparent text-[15px] font-semibold text-danger"
            >
                Resign game
            </button>
            {state === 'confirm' && (
                <div className="flex items-center gap-2 rounded-12 border-1 border-danger-zone-line bg-danger-zone-bg px-3 py-[10px]">
                    <span className="flex-1 text-[14px]">Resign this game?</span>
                    <button
                        type="button"
                        onClick={() => setState('done')}
                        className="min-h-[36px] rounded-pill border-0 bg-danger px-[14px] font-bold text-on-accent"
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        onClick={() => setState('')}
                        className="min-h-[36px] border-0 bg-transparent px-3 font-semibold text-ink"
                    >
                        No
                    </button>
                </div>
            )}
            <span className="min-h-[20px] text-[14px] text-danger">
                {state === 'done' ? 'You resigned. Game over.' : ''}
            </span>
        </div>
    );
}

/** Default time control, auto-queen and resign confirmation, tried out on demo controls. */
export function GameplayPreview({ settings }: { settings: UserSettings }) {
    return (
        <PreviewCard>
            <div className="flex flex-col gap-2">
                <span className={CAPTION}>New game starts on</span>
                <div className="grid grid-cols-2 gap-2">
                    {TIME_CONTROLS.map((tc) => {
                        const on = tc === settings.defaultTimeControl;
                        return (
                            <span
                                key={tc}
                                className={cn(
                                    'flex min-h-[44px] items-center justify-center rounded-12 border-1.5 text-[14px] font-semibold',
                                    on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-bg-base text-ink',
                                )}
                            >
                                {SPEED_BUCKET_LABELS[tc]} · {CLOCKS[tc]}
                            </span>
                        );
                    })}
                </div>
            </div>
            <Promotion autoQueen={settings.autoQueen} />
            <Resign confirm={settings.confirmResignDraw} />
        </PreviewCard>
    );
}
