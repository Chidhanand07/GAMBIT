'use client';

import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/design/cn';
import type { ResignEstimate } from '../hooks/useResignEstimate';
import type { ConfirmDialog } from '../state/gameReducer';
import { GAME_ICONS } from './gameIcons';

interface ConfirmDialogsProps {
    open: ConfirmDialog;
    opponentName: string;
    rated: boolean;
    /** The server's figure for a loss now; null until it has answered. */
    estimate: ResignEstimate | null;
    onConfirmResign: () => void;
    onConfirmDraw: () => void;
    onCancel: () => void;
}

const ANSWER = 'min-h-[52px] rounded-pill text-[16px]';

function Answers({
    yes,
    no,
    onYes,
    onNo,
    tone,
}: {
    yes: string;
    no: string;
    onYes: () => void;
    onNo: () => void;
    tone: 'accent' | 'danger';
}) {
    return (
        <>
            <button
                type="button"
                onClick={onYes}
                className={cn(
                    ANSWER,
                    'border-0 font-bold text-on-accent',
                    tone === 'danger' ? 'bg-danger' : 'bg-accent',
                )}
            >
                {yes}
            </button>
            <button
                type="button"
                onClick={onNo}
                className={cn(ANSWER, 'border-1.5 border-line-muted bg-transparent font-semibold text-ink')}
            >
                {no}
            </button>
        </>
    );
}

/**
 * "You will lose this game and about 7 rating points." (Game.dc.html) with the server's figure;
 * "and rating points" while it is on its way or unknown; no rating words for an unrated game.
 */
export function resignText(rated: boolean, estimate: ResignEstimate | null): string {
    const tail = " This can't be undone.";
    if (estimate?.rated === false || (!rated && !estimate)) return `You will lose this game.${tail}`;
    if (!estimate) return `You will lose this game and rating points.${tail}`;
    const unit = estimate.points === 1 ? 'rating point' : 'rating points';
    return `You will lose this game and about ${estimate.points} ${unit}.${tail}`;
}

/**
 * The Draw and Resign confirmations (Game.dc.html): focus-trapped alert dialogs, Esc or the
 * backdrop cancels. The rating figure in the resign text is computed by the server (F-133).
 */
export function ConfirmDialogs({
    open,
    opponentName,
    rated,
    estimate,
    onConfirmResign,
    onConfirmDraw,
    onCancel,
}: ConfirmDialogsProps) {
    return (
        <>
            <Dialog
                open={open === 'resign'}
                onClose={onCancel}
                role="alertdialog"
                tone="danger"
                iconPath={GAME_ICONS.resign}
                title="Resign this game?"
                description={resignText(rated, estimate)}
            >
                <Answers yes="Yes, resign" no="Keep playing" onYes={onConfirmResign} onNo={onCancel} tone="danger" />
            </Dialog>
            <Dialog
                open={open === 'draw'}
                onClose={onCancel}
                role="alertdialog"
                tone="accent"
                iconPath={GAME_ICONS.draw}
                title={`Offer a draw to ${opponentName}?`}
                description={`${opponentName} can accept or decline. If they decline, the game continues.`}
            >
                <Answers yes="Offer draw" no="Cancel" onYes={onConfirmDraw} onNo={onCancel} tone="accent" />
            </Dialog>
        </>
    );
}
