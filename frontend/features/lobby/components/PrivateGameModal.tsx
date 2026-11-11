import { X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PRIVATE_COLOR_OPTIONS, PRIVATE_TIME_CONTROL_IDS } from '../timeControls';
import type { PrivateGame } from '../hooks/usePrivateGame';

const QR_SIZE_PX = 160;

interface PrivateGameModalProps {
    game: PrivateGame;
    onClose: () => void;
    onOpenRoom: () => void;
}

const optionStyle = (selected: boolean) => ({
    background: selected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
    border: selected ? '1px solid var(--accent)' : '0.5px solid var(--border)',
    color: selected ? 'var(--accent)' : 'var(--text-secondary)',
});

function OptionLabel({ children }: { children: string }) {
    return (
        <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
            {children}
        </label>
    );
}

function RatedToggle({ rated, onToggle }: { rated: boolean; onToggle: () => void }) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Rated game
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Affects Glicko-2 rating
                </div>
            </div>
            <button
                onClick={onToggle}
                className="w-10 h-5 rounded-full transition-colors relative"
                style={{
                    background: rated ? 'var(--accent)' : 'var(--bg-elevated)',
                    border: '0.5px solid var(--border-strong)',
                }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow"
                    style={{ left: rated ? 'calc(100% - 18px)' : '2px' }}
                />
            </button>
        </div>
    );
}

function PrivateGameConfig({ game }: { game: PrivateGame }) {
    return (
        <div className="p-6 space-y-5">
            <div>
                <OptionLabel>Time Control</OptionLabel>
                <div className="grid grid-cols-3 gap-2">
                    {PRIVATE_TIME_CONTROL_IDS.map((tc) => (
                        <button
                            key={tc}
                            onClick={() => game.setPrivateTc(tc)}
                            className="py-2 rounded-lg text-sm capitalize transition-colors"
                            style={optionStyle(game.privateTc === tc)}
                        >
                            {tc}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <OptionLabel>Your Color</OptionLabel>
                <div className="grid grid-cols-3 gap-2">
                    {PRIVATE_COLOR_OPTIONS.map(([v, l]) => (
                        <button
                            key={v}
                            onClick={() => game.setPrivateColor(v)}
                            className="py-2 rounded-lg text-sm transition-colors"
                            style={optionStyle(game.privateColor === v)}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            <RatedToggle rated={game.privateRated} onToggle={game.toggleRated} />
            <button
                onClick={game.createInvite}
                className="w-full py-3 rounded-xl font-semibold text-sm btn-press transition-all"
                style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
                Generate Invite Link
            </button>
        </div>
    );
}

function PrivateGameGenerating() {
    return (
        <div className="p-12 flex flex-col items-center gap-3">
            <div
                className="w-8 h-8 border-2 border-t-accent rounded-full animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Creating game…
            </span>
        </div>
    );
}

function PrivateGameShare({ game, onOpenRoom }: { game: PrivateGame; onOpenRoom: () => void }) {
    const { inviteLink, justCopied } = game;
    return (
        <div className="p-6 space-y-5">
            <div className="text-center">
                <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Share this link
                </div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Valid for 48 hours
                </div>
            </div>
            <div
                className="rounded-xl p-3 flex items-center gap-2 justify-between"
                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}
            >
                <span className="text-xs truncate flex-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {inviteLink}
                </span>
                <button
                    onClick={game.copyInviteLink}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                        background: justCopied ? 'rgba(79,168,90,0.15)' : 'var(--bg-active)',
                        border: '0.5px solid var(--border)',
                        color: justCopied ? 'var(--green)' : 'var(--text-secondary)',
                    }}
                >
                    {justCopied ? <>✓ Copied</> : <>Copy</>}
                </button>
            </div>
            {inviteLink && (
                <div className="flex justify-center">
                    <QRCodeSVG value={inviteLink} size={QR_SIZE_PX} bgColor="#231F1B" fgColor="#F2EDE6" level="M" />
                </div>
            )}
            <button
                onClick={onOpenRoom}
                className="w-full py-3 rounded-xl font-medium text-sm btn-press transition-colors"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border-strong)',
                    color: 'var(--text-primary)',
                }}
            >
                Open Game Room
            </button>
        </div>
    );
}

/** "Play a Friend": configure → generating → share. State lives in usePrivateGame. */
export function PrivateGameModal({ game, onClose, onOpenRoom }: PrivateGameModalProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border-strong)' }}
            >
                <div
                    className="px-6 py-4 border-b flex items-center justify-between"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                >
                    <h2 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        Play a Friend
                    </h2>
                    <button onClick={onClose} className="transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                        <X size={18} strokeWidth={1.5} />
                    </button>
                </div>

                {game.inviteState === 'config' && <PrivateGameConfig game={game} />}
                {game.inviteState === 'generating' && <PrivateGameGenerating />}
                {game.inviteState === 'share' && <PrivateGameShare game={game} onOpenRoom={onOpenRoom} />}
            </div>
        </div>
    );
}
