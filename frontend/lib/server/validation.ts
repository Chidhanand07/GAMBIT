import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TIME_CONTROL_PRESETS, normalizeTimeControl } from '@/lib/chess/timeControl';
import { EXPERIENCE_LEVELS, PLAYING_STYLES, PROFILE_TEXT_LIMITS, PRONOUNS, isHttpsUrl } from '@/lib/profile/fields';

// Input schemas for the route handlers (NX-07 step 2, NODE-08). Every route param, query
// value and request body goes through `parseInput` / `parseJsonBody` before it is used.

const HTTP_BAD_REQUEST = 400;
const DEFAULT_ERROR = 'Invalid request';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;
const DEFAULT_LIVE_GAMES = 10;
const MAX_LIVE_GAMES = 20;
const MAX_USERNAME_PARAM_LENGTH = 40;
const MIN_NEW_USERNAME_LENGTH = 3;
const MAX_NEW_USERNAME_LENGTH = 20;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 500;
const MAX_COUNTRY_LENGTH = 60;
const MAX_URL_LENGTH = 2048;
const MAX_FEN_LENGTH = 100;
const MAX_TIME_CONTROL_LENGTH = 16;

/** Whole-number text only ("10", not "1e3", "1.5" or " 5"). */
const integerText = z.string().regex(/^\d{1,7}$/);

/**
 * A query-string integer with a default for a missing parameter. `.optional()` keeps an absent key
 * on the default: zod 4 rejects a missing object key unless its schema is optional (F-094).
 */
const queryInt = (fallback: number) =>
    z
        .union([integerText, z.null()])
        .optional()
        .transform((value) => (value === null || value === undefined ? fallback : Number.parseInt(value, 10)));

/**
 * A time control from a client, turned into the canonical "<min>+<inc>" of the shared model
 * (lib/chess/timeControl): "10" → "10+0". Limits come from the shared definition. A lobby
 * preset name ("rapid", "daily") is still accepted, for tabs opened before presets were sent
 * as real time controls, and is mapped to the preset's time control; anything else is refused.
 */
const timeControl = z
    .string()
    .max(MAX_TIME_CONTROL_LENGTH)
    .transform((value) => normalizeTimeControl(TIME_CONTROL_PRESETS[value] ?? value))
    .refine((value): value is string => value !== null);

/** Optional profile text: a bounded string, null, or absent. */
const optionalText = (max: number) => z.string().max(max).nullish();

/** An optional public-profile field (F-127): non-empty and bounded (the database refuses ""), null clears it. */
const optionalField = (max: number) => z.string().trim().min(1).max(max).nullish();

/** An optional link: an https URL with a host (F-127; the database CHECK is the same rule). */
const optionalHttpsUrl = z.string().trim().max(PROFILE_TEXT_LIMITS.website).refine(isHttpsUrl).nullish();

const MAX_PLAY_KEYS = 32;
const MAX_PLAY_TOKEN_LENGTH = 32;
const optionalFlag = z.boolean().optional();

/**
 * The play preferences object (features/settings/model.ts): short string or boolean values
 * only, a bounded number of keys. The route normalises it with parseSettings before storing.
 */
const playPreferences = z
    .record(z.string().max(MAX_PLAY_TOKEN_LENGTH), z.union([z.string().max(MAX_PLAY_TOKEN_LENGTH), z.boolean()]))
    .refine((value) => Object.keys(value).length <= MAX_PLAY_KEYS);

export const schemas = {
    /**
     * Any 8-4-4-4-12 hex id. z.guid(), not z.uuid(): zod 4's uuid() also checks the RFC 9562
     * version and variant digits, which zod 3's did not; the charset is what keeps PostgREST
     * filters safe (F-094).
     */
    uuid: z.guid(),
    /**
     * A username in a URL. Lookups are parameterised (`.eq('username', …)`), so this only has
     * to keep out separators and oversized values; it is wider than `newUsername` because
     * older accounts may hold names created before any server-side rule existed.
     */
    usernameParam: z.string().regex(new RegExp(`^[A-Za-z0-9_.-]{1,${MAX_USERNAME_PARAM_LENGTH}}$`)),
    /** A username being created: the same rule the signup form shows the user. */
    newUsername: z.string().regex(new RegExp(`^[A-Za-z0-9_]{${MIN_NEW_USERNAME_LENGTH},${MAX_NEW_USERNAME_LENGTH}}$`)),
    friendAction: z.enum(['accept', 'decline']),
    ratingField: z.enum(['rating_rapid', 'rating_bullet', 'rating_blitz', 'rating_classical']),
    /** A leaderboard: one rating pool, or "All" (profiles.rating_all, F-125). */
    leaderboardField: z.enum(['rating_all', 'rating_rapid', 'rating_bullet', 'rating_blitz', 'rating_classical']),
    gamesPage: z.object({
        limit: queryInt(DEFAULT_PAGE_SIZE)
            .pipe(z.number().int().min(1))
            .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
        offset: queryInt(0).pipe(z.number().int().min(0).max(MAX_OFFSET)),
    }),
    /** GET /api/games/live?limit=: how many games, bounded. */
    liveGames: z.object({
        limit: queryInt(DEFAULT_LIVE_GAMES)
            .pipe(z.number().int().min(1))
            .transform((n) => Math.min(n, MAX_LIVE_GAMES)),
    }),
    /**
     * POST /api/auth/login: `identifier` is an e-mail or a username (Signin.dc.html "Email or
     * username"). `email` is the older body's name for it and is still accepted (F-101).
     */
    login: z
        .object({
            identifier: z.string().trim().min(1).max(MAX_EMAIL_LENGTH).optional(),
            email: z.string().trim().min(1).max(MAX_EMAIL_LENGTH).optional(),
            password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
        })
        .transform(({ identifier, email, password }) => ({ identifier: identifier ?? email ?? '', password }))
        .refine((body) => body.identifier !== ''),
    signup: z.object({
        email: z.string().min(1).max(MAX_EMAIL_LENGTH),
        password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
        username: z.string().min(1).max(MAX_USERNAME_PARAM_LENGTH),
    }),
    friendRequest: z.object({ addressee_username: z.string().min(1).max(MAX_USERNAME_PARAM_LENGTH) }),
    privateGame: z.object({
        timeControl,
        color: z.enum(['white', 'black', 'random', 'White', 'Black', 'Random']).optional(),
        isRated: z.boolean().optional(),
    }),
    profilePatch: z.object({
        displayName: optionalText(MAX_DISPLAY_NAME_LENGTH),
        bio: optionalText(MAX_BIO_LENGTH),
        country: optionalText(MAX_COUNTRY_LENGTH),
        avatarUrl: optionalText(MAX_URL_LENGTH),
        city: optionalField(PROFILE_TEXT_LIMITS.city),
        website: optionalHttpsUrl,
        favoriteOpening: optionalField(PROFILE_TEXT_LIMITS.favoriteOpening),
        favoritePlayer: optionalField(PROFILE_TEXT_LIMITS.favoritePlayer),
        pronouns: z.enum(PRONOUNS).nullish(),
        playingStyle: z.enum(PLAYING_STYLES).nullish(),
        experience: z.enum(EXPERIENCE_LEVELS).nullish(),
    }),
    /** POST /api/account/email (ADR F-143): the new address, trimmed and lower-cased. */
    emailChange: z.object({
        email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email()),
    }),
    /** PATCH /api/settings (ADR F-140): any subset of the sections and their keys. */
    preferencesPatch: z.object({
        play: playPreferences.optional(),
        notifications: z
            .object({
                challenges: optionalFlag,
                friendRequests: optionalFlag,
                gameResults: optionalFlag,
                yourTurn: optionalFlag,
                emailDigest: optionalFlag,
                browser: optionalFlag,
            })
            .optional(),
        privacy: z
            .object({
                showOnline: optionalFlag,
                challengePolicy: z.enum(['everyone', 'friends', 'nobody']).optional(),
                appearInSearch: optionalFlag,
                showOnLeaderboard: optionalFlag,
                allowSpectators: optionalFlag,
            })
            .optional(),
        security: z.object({ emailOnNewSignIn: optionalFlag }).optional(),
    }),
    gamePatch: z.object({ draw_offer: z.boolean().optional(), rematch_requested: z.boolean().optional() }),
    computerMove: z.object({
        fen: z.string().min(1).max(MAX_FEN_LENGTH),
        difficulty: z.string().max(16).optional(),
    }),
};

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** 400 with a fixed message. The rejected input is never echoed back. */
function badRequest(message: string): NextResponse {
    return NextResponse.json({ error: message }, { status: HTTP_BAD_REQUEST });
}

/** Parse one value (a route param, a query object, an already-read body). */
export function parseInput<S extends z.ZodTypeAny>(
    schema: S,
    input: unknown,
    message = DEFAULT_ERROR,
): Parsed<z.infer<S>> {
    const parsed = schema.safeParse(input);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: badRequest(message) };
}

/** Read and parse a JSON request body; malformed JSON is a 400, not a thrown error. */
export async function parseJsonBody<S extends z.ZodTypeAny>(
    request: Request,
    schema: S,
    message = DEFAULT_ERROR,
): Promise<Parsed<z.infer<S>>> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return { ok: false, response: badRequest(message) };
    }
    return parseInput(schema, body, message);
}
