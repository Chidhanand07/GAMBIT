'use client';

// Notices above the board: own reconnect, history viewing, opponent disconnect countdown. The
// mockup has none; they use the status line's inset surface (Game.dc.html controls card).
import type { ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

export interface StatusBannersProps {
    connected: boolean;
    isLive: boolean;
    viewIndex: number | null;
    snapshotCount: number;
    onReturnLive: () => void;
    showOpponentDisconnected: boolean;
    disconnectCountdown: number;
}

interface NoticeProps {
    tone: 'accent' | 'danger';
    /** `alert` for errors that need attention now. */
    role?: 'status' | 'alert';
    children: ReactNode;
}

/** One notice row: the status line's inset surface with a coloured dot. */
export function GameNotice({ tone, role = 'status', children }: NoticeProps) {
    return (
        <div
            role={role}
            className="flex items-center gap-3 rounded-14 border-1 border-line-subtle bg-bg-base px-[14px] py-[10px] text-[14px]"
        >
            <span
                aria-hidden="true"
                className={cn('h-3 w-3 shrink-0 rounded-full', tone === 'danger' ? 'bg-danger' : 'bg-accent')}
            />
            <span className="flex flex-1 flex-wrap items-center justify-between gap-x-3">{children}</span>
        </div>
    );
}

export function StatusBanners(props: StatusBannersProps) {
    return (
        <>
            {!props.connected && <GameNotice tone="danger">Reconnecting…</GameNotice>}
            {!props.isLive && props.viewIndex !== null && (
                <GameNotice tone="accent">
                    Viewing move {props.viewIndex + 1} of {props.snapshotCount} —{' '}
                    <button
                        type="button"
                        onClick={props.onReturnLive}
                        className="border-0 bg-transparent p-0 font-semibold text-accent underline"
                    >
                        Return to live
                    </button>
                </GameNotice>
            )}
            {props.showOpponentDisconnected && (
                <GameNotice tone="danger">
                    Opponent disconnected — they have {props.disconnectCountdown}s to reconnect
                </GameNotice>
            )}
        </>
    );
}
