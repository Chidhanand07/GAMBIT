import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TIME_CONTROL_PRESETS, normalizeTimeControl } from '@/lib/chess/timeControl';

// Input schemas for the route handlers (NX-07 step 2, NODE-08). Every route param, query
// value and request body goes through `parseInput` / `parseJsonBody` before it is used.

const HTTP_BAD_REQUEST = 400;
const DEFAULT_ERROR = 'Invalid request';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;
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
    gamesPage: z.object({
        limit: queryInt(DEFAULT_PAGE_SIZE)
            .pipe(z.number().int().min(1))
            .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
        offset: queryInt(0).pipe(z.number().int().min(0).max(MAX_OFFSET)),
    }),
    login: z.object({
        email: z.string().min(1).max(MAX_EMAIL_LENGTH),
        password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    }),
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
