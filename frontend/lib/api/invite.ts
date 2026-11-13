import type { GameWithPlayers } from '@/types/game';
import type { Profile } from '@/types/profile';

/** GET {socketUrl}/api/games/join/{token}; null when missing/expired or on a network error. */
export async function fetchInviteGame(socketUrl: string, token: string): Promise<GameWithPlayers | null> {
    try {
        const res = await fetch(`${socketUrl}/api/games/join/${token}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/** GET /api/profile/me; null when signed out or on any error. */
export async function fetchMyProfile(): Promise<Profile | null> {
    try {
        const res = await fetch('/api/profile/me');
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/** POST {socketUrl}/api/games/join/{token} with the Supabase access token as bearer. */
export function postJoinInvite(socketUrl: string, token: string, accessToken: string): Promise<Response> {
    return fetch(`${socketUrl}/api/games/join/${token}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
    });
}
