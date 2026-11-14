import 'server-only';

const INVITE_TOKEN_LENGTH = 10;
const INVITE_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const INVITE_TTL_HOURS = 48;
/** Above this `Math.random()` value a random-colour creator plays white. */
const RANDOM_WHITE_THRESHOLD = 0.5;

/**
 * Largest multiple of the alphabet size that fits in a byte (62 × 4 = 248). A byte at or above
 * it is redrawn: `byte % 62` over all 256 values would make the first 8 characters 25 % more
 * likely than the rest (F18).
 */
const BYTE_VALUES = 256;
const UNBIASED_BYTE_LIMIT = Math.floor(BYTE_VALUES / INVITE_TOKEN_ALPHABET.length) * INVITE_TOKEN_ALPHABET.length;

/** Random URL-safe invite token: crypto.getRandomValues with rejection sampling (uniform). */
function generateInviteToken(len: number): string {
    let result = '';
    const bytes = new Uint8Array(len);
    while (result.length < len) {
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b < UNBIASED_BYTE_LIMIT && result.length < len)
                result += INVITE_TOKEN_ALPHABET[b % INVITE_TOKEN_ALPHABET.length];
        }
    }
    return result;
}

/** Seats for the creator: 'white' / 'black' (any case), otherwise a coin flip. */
function assignSeats(color: string | undefined, userId: string) {
    const colorLower = (color || 'random').toLowerCase();
    let white_id: string | null = null;
    let black_id: string | null = null;
    if (colorLower === 'white') white_id = userId;
    else if (colorLower === 'black') black_id = userId;
    else if (Math.random() > RANDOM_WHITE_THRESHOLD) white_id = userId;
    else black_id = userId;
    return { white_id, black_id };
}

/**
 * `games` row for a private invite game. It carries no invite columns: `games` is readable
 * through the public API key, so the token lives in `game_invites` (see {@link newInvite}).
 */
export function buildPrivateGameRow(
    userId: string,
    input: { timeControl: string; color?: string; isRated?: boolean },
): Record<string, unknown> {
    const { white_id, black_id } = assignSeats(input.color, userId);
    return {
        white_id,
        black_id,
        time_control: input.timeControl,
        status: 'waiting',
        is_rated: input.isRated ?? false,
    };
}

/** A fresh invite (random token, valid for 48 hours) for the `game_invites` table. */
export function newInvite(gameId: string): { game_id: string; token: string; expires_at: string } {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITE_TTL_HOURS);
    return { game_id: gameId, token: generateInviteToken(INVITE_TOKEN_LENGTH), expires_at: expiresAt.toISOString() };
}
