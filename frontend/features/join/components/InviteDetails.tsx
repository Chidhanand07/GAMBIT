import { Timer, Zap, Flame, BookOpen } from 'lucide-react';
import { SPEED_BUCKET_LABELS, classifyTimeControl, displayTimeControl } from '@/lib/chess/timeControl';
import type { GameWithPlayers } from '@/types/game';

const BUCKET_ICONS = { bullet: Zap, blitz: Flame, rapid: Timer, classical: BookOpen };

function tcLabel(tc: string) {
    const bucket = classifyTimeControl(tc);
    const Icon = BUCKET_ICONS[bucket];
    return { label: SPEED_BUCKET_LABELS[bucket], icon: <Icon size={18} strokeWidth={1.5} /> };
}

function YourColor({ isCreator, creatorIsWhite }: { isCreator: boolean; creatorIsWhite: boolean }) {
    const playsWhite = isCreator === creatorIsWhite;
    return playsWhite ? <>♔ White</> : <>♚ Black</>;
}

interface InviteDetailsProps {
    game: GameWithPlayers;
    isCreator: boolean;
    creatorIsWhite: boolean;
}

/** Time control / rated / colour rows of the invite card. */
export function InviteDetails({ game, isCreator, creatorIsWhite }: InviteDetailsProps) {
    const tc = tcLabel(game.time_control);
    return (
        <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <span className="text-text-secondary text-sm">Time Control</span>
                <span className="flex items-center gap-1.5 text-text-primary text-sm font-medium">
                    <span className="text-accent">{tc.icon}</span>
                    {tc.label} · {displayTimeControl(game.time_control)}
                </span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <span className="text-text-secondary text-sm">Rated</span>
                <span className={`text-sm font-medium ${game.is_rated ? 'text-accent' : 'text-text-tertiary'}`}>
                    {game.is_rated ? 'Yes' : 'Casual'}
                </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
                <span className="text-text-secondary text-sm">Your color</span>
                <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <YourColor isCreator={isCreator} creatorIsWhite={creatorIsWhite} />
                </span>
            </div>
        </div>
    );
}
