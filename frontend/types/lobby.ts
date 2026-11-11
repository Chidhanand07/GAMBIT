// Lobby wire shapes (GET /api/games/active, POST /api/games/private/create).
import type { Game, PlayerColor } from './game';

/** What the lobby reads from GET /api/games/active (it only checks `id`). */
export type ActiveGame = Pick<Game, 'id' | 'time_control'>;

/** Colour picked for a private game; sent verbatim as `color`. */
export type PrivateColor = PlayerColor | 'random';
