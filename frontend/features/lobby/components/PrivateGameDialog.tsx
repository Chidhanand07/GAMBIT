import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { PrivateGame } from '../hooks/usePrivateGame';
import { PrivateGameOptions } from './PrivateGameOptions';

const QR_SIZE_PX = 160;
const LINK_ICON =
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';

interface PrivateGameDialogProps {
    open: boolean;
    game: PrivateGame;
    onClose: () => void;
    onOpenRoom: () => void;
}

function ShareStep({ game, onOpenRoom }: { game: PrivateGame; onOpenRoom: () => void }) {
    const { inviteLink, justCopied } = game;
    return (
        <>
            <span className="font-semibold">Share this link</span>
            <span className="text-[13px] text-ink-muted">Valid for 48 hours</span>
            <div className="flex items-center gap-2 rounded-14 border-1 border-line-subtle bg-bg-base p-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-left font-mono text-[13px] text-ink-muted">
                    {inviteLink}
                </span>
                <Button variant="outline" size="sm" onClick={game.copyInviteLink}>
                    {justCopied ? '✓ Copied' : 'Copy'}
                </Button>
            </div>
            {inviteLink && (
                <div className="flex justify-center py-2 text-ink">
                    <QRCodeSVG
                        value={inviteLink}
                        size={QR_SIZE_PX}
                        bgColor="transparent"
                        fgColor="currentColor"
                        level="M"
                    />
                </div>
            )}
            <Button variant="outline" size="lg" onClick={onOpenRoom}>
                Open Game Room
            </Button>
        </>
    );
}

/** Invite anyone with a link: configure → generating → share. State lives in usePrivateGame. */
export function PrivateGameDialog({ open, game, onClose, onOpenRoom }: PrivateGameDialogProps) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Invite with a link"
            iconPath={LINK_ICON}
            description="Anyone with the link can join this game."
        >
            {game.inviteState === 'config' && (
                <>
                    <PrivateGameOptions game={game} />
                    <Button size="lg" onClick={game.createInvite} className="mt-2">
                        Generate Invite Link
                    </Button>
                </>
            )}
            {game.inviteState === 'generating' && (
                <span role="status" className="py-6 text-ink-muted">
                    Creating game…
                </span>
            )}
            {game.inviteState === 'share' && <ShareStep game={game} onOpenRoom={onOpenRoom} />}
            <Button variant="ghost" onClick={onClose}>
                Close
            </Button>
        </Dialog>
    );
}
