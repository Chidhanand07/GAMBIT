'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { fmtTime } from '@/lib/chess/clock';
import type { ProfileSummary } from '@/types/profile';

const DEFAULT_RATING = 1200;
const DEFAULT_MINUTES = 10;
const BULLET_UNDER_MINUTES = 3;
const BLITZ_UNDER_MINUTES = 10;
const CLASSICAL_FROM_MINUTES = 30;
const CRITICAL_SECONDS = 30;

type Player = ProfileSummary | null | undefined;

/** Base minutes of "<min>" or "<min>+<inc>"; missing or unparseable → 10. */
function stripMinutes(tc?: string): number {
    if (!tc) return DEFAULT_MINUTES;
    const mins = tc.includes('+') ? parseInt(tc.split('+')[0], 10) : parseInt(tc, 10);
    return isNaN(mins) ? DEFAULT_MINUTES : mins;
}

/**
 * Rating shown on the strip. Uses this page's own buckets (<3 bullet, <10 blitz, ≥30 classical,
 * else rapid), which differ from lib/chess on purpose (ADR 0200).
 */
export function getFormatRating(p: Player, tc?: string): number {
    if (!p) return DEFAULT_RATING;
    const mins = stripMinutes(tc);
    const rating = (r: number | null | undefined) => Math.round(r ?? DEFAULT_RATING);
    if (mins < BULLET_UNDER_MINUTES) return rating(p.rating_bullet);
    if (mins < BLITZ_UNDER_MINUTES) return rating(p.rating_blitz);
    if (mins >= CLASSICAL_FROM_MINUTES) return rating(p.rating_classical);
    return rating(p.rating_rapid);
}

/** Critical (<30 s while running) > my running clock > running clock > idle. */
export function clockStyle(isCritical: boolean, isMine: boolean, isActive: boolean): CSSProperties {
    if (isCritical)
        return { background: 'rgba(192,57,43,0.15)', border: '0.5px solid rgba(192,57,43,0.4)', color: '#E74C3C' };
    if (isMine && isActive)
        return { background: 'var(--accent-dim)', border: '1.5px solid var(--accent)', color: 'var(--accent)' };
    if (isActive)
        return {
            background: 'var(--bg-active)',
            border: '0.5px solid var(--border-accent)',
            color: 'var(--text-primary)',
        };
    return { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', color: 'var(--text-tertiary)' };
}

function PlayerAvatar({ player, username }: { player: Player; username?: string }) {
    if (!username) {
        return (
            <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
            >
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    ?
                </span>
            </div>
        );
    }
    return (
        <Link
            href={`/profile/${username}`}
            className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
        >
            {player?.avatar_url ? (
                <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
                <span className="text-accent font-semibold text-sm">{username[0].toUpperCase()}</span>
            )}
        </Link>
    );
}

function PlayerName({ player, username, isMe }: { player: Player; username?: string; isMe?: boolean }) {
    return (
        <div
            className="font-medium text-sm leading-none flex items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}
        >
            {username ? (
                <Link href={`/profile/${username}`} className="hover:text-accent transition-colors">
                    {player?.display_name || username}
                </Link>
            ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>Waiting…</span>
            )}
            {isMe && (
                <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                        color: 'var(--text-tertiary)',
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border)',
                    }}
                >
                    You
                </span>
            )}
        </div>
    );
}

export interface PlayerStripProps {
    player: Player;
    time: number;
    isActive: boolean;
    isBottom: boolean;
    ratingChange: number | null;
    isMe?: boolean;
    timeControl?: string;
}

export default function PlayerStrip({
    player,
    time,
    isActive,
    isBottom,
    ratingChange,
    isMe,
    timeControl,
}: PlayerStripProps) {
    const rating = getFormatRating(player, timeControl);
    const username = player?.username;
    const isCritical = time < CRITICAL_SECONDS && isActive;
    return (
        <div
            className={`flex justify-between items-center px-4 transition-colors ${isBottom ? 'rounded-b-xl border-t-0' : 'rounded-t-xl'}`}
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', height: 52 }}
        >
            <div className="flex items-center gap-3">
                <PlayerAvatar player={player} username={username} />
                <div>
                    <PlayerName player={player} username={username} isMe={isMe} />
                    <div
                        className="text-xs mt-0.5 flex items-center gap-1 tabular-nums"
                        style={{ color: 'var(--text-tertiary)' }}
                    >
                        {rating}
                        {ratingChange !== null && (
                            <span
                                className={ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}
                                style={{ fontSize: 11 }}
                            >
                                {ratingChange >= 0 ? '+' : ''}
                                {ratingChange}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Clock */}
            <div
                className={`px-4 py-2 rounded-lg font-mono text-xl tabular-nums transition-all ${isCritical ? 'clock-critical' : ''}`}
                style={clockStyle(isCritical, !!isMe, isActive)}
            >
                {fmtTime(time)}
            </div>
        </div>
    );
}
