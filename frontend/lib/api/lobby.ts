// Client-side fetch helpers for the /api routes the lobby page calls.
// Same URL, method, headers and body as the original inline page code.
import type { ActiveGame, PrivateColor } from '@/types/lobby';
import type { TimeControl } from '@/types/timeControl';

export interface CreatePrivateGameBody {
    timeControl: TimeControl;
    color: PrivateColor;
    isRated: boolean;
}

/** Response of POST /api/games/private/create: `token` on success, `error` otherwise. */
export interface CreatePrivateGameResponse {
    token?: string;
    game_id?: string;
    error?: unknown;
}

/** GET /api/games/active (no options). Resolves to the parsed body, or null for a non-ok response. */
export function fetchActiveGame(): Promise<ActiveGame | null> {
    return fetch('/api/games/active').then((r) => (r.ok ? r.json() : null));
}

/** POST /api/games/private/create. Resolves to the parsed body whatever the status. */
export async function createPrivateGame(body: CreatePrivateGameBody): Promise<CreatePrivateGameResponse> {
    const res = await fetch('/api/games/private/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}
