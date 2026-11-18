'use client';

import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/design/cn';
import type { ConfirmDialog } from '../state/gameReducer';
import { GAME_ICONS } from './gameIcons';

interface ConfirmDialogsProps {
    open: ConfirmDialog;
    opponentName: string;
    rated: boolean;
    /**
     * Rating points at stake (Game.dc.html "about 7 rating points"). Optional: no estimate is
     * computed yet (data-live track); without it the text names no figure.
     */
    ratingRisk?: number | null;
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

/** " and about 7 rating points" with an estimate, " and rating points" without, "" unrated. */
function resignStake(rated: boolean, ratingRisk?: number | null): string {
    if (!rated) return '';
    return typeof ratingRisk === 'number' ? ` and about ${ratingRisk} rating points` : ' and rating points';
}

/**
 * The Draw and Resign confirmations (Game.dc.html): focus-trapped alert dialogs, Esc or the
 * backdrop cancels. The resign text names a rating figure only when an estimate is passed in.
 */
export function ConfirmDialogs({
    open,
    opponentName,
    rated,
    ratingRisk,
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
                description={`You will lose this game${resignStake(rated, ratingRisk)}. This can't be undone.`}
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
