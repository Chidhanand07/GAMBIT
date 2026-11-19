import { InfoRow } from '@/components/ui/InfoRow';
import { SPEED_BUCKET_LABELS, classifyTimeControl, displayTimeControl } from '@/lib/chess/timeControl';
import type { GameWithPlayers } from '@/types/game';

interface InviteDetailsProps {
    game: GameWithPlayers;
    isCreator: boolean;
    creatorIsWhite: boolean;
}

/** Time control / rated / colour of the invite, as the design's label / value rows. */
export function InviteDetails({ game, isCreator, creatorIsWhite }: InviteDetailsProps) {
    const bucket = SPEED_BUCKET_LABELS[classifyTimeControl(game.time_control)];
    const playsWhite = isCreator === creatorIsWhite;
    return (
        <div className="flex flex-col">
            <InfoRow label="Time Control" value={`${bucket} · ${displayTimeControl(game.time_control)}`} />
            <InfoRow label="Rated" value={game.is_rated ? 'Yes' : 'Casual'} />
            <InfoRow label="Your color" value={playsWhite ? '♔ White' : '♚ Black'} />
        </div>
    );
}
