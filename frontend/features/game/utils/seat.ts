import type { GameWithPlayers, SeatColor } from '@/types/game';

/** Viewer's seat from the game row: white, black, or spectator. */
export function seatFor(game: Pick<GameWithPlayers, 'white_id' | 'black_id'>, profileId: string): SeatColor {
    if (game.white_id === profileId) return 'white';
    if (game.black_id === profileId) return 'black';
    return 'spectator';
}
