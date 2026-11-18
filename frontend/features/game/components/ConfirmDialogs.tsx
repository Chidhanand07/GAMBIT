'use client';

import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/design/cn';
import type { ConfirmDialog } from '../state/gameReducer';
import { GAME_ICONS } from './gameIcons';

interface ConfirmDialogsProps {
    open: ConfirmDialog;
    opponentName: string;
    rated: boolean;
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
 * The Draw and Resign confirmations (Game.dc.html): focus-trapped alert dialogs, Esc or the
 * backdrop cancels. The resign text names no rating figure: the change is computed by the server.
 */
export function ConfirmDialogs({
    open,
    opponentName,
    rated,
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
                description={`You will lose this game${rated ? ' and rating points' : ''}. This can't be undone.`}
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
