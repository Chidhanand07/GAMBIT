import 'server-only';

const INVITE_TOKEN_LENGTH = 10;
const INVITE_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const INVITE_TTL_HOURS = 48;
/** Above this `Math.random()` value a random-colour creator plays white. */
const RANDOM_WHITE_THRESHOLD = 0.5;

/** Random URL-safe invite token (crypto.getRandomValues, modulo the 62-char alphabet). */
function generateInviteToken(len: number): string {
    let result = '';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    for (const b of bytes) result += INVITE_TOKEN_ALPHABET[b % INVITE_TOKEN_ALPHABET.length];
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

/** `games` row for a private invite game that expires in 48 hours. */
export function buildPrivateGameRow(
    userId: string,
    input: { timeControl: string; color?: string; isRated?: boolean },
): Record<string, unknown> {
    const token = generateInviteToken(INVITE_TOKEN_LENGTH);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITE_TTL_HOURS);
    const { white_id, black_id } = assignSeats(input.color, userId);
    return {
        white_id,
        black_id,
        time_control: input.timeControl,
        status: 'waiting',
        invite_token: token,
        invite_expires_at: expiresAt.toISOString(),
        is_rated: input.isRated ?? false,
    };
}
