// Where a user may be sent after signing in, when the destination comes from a query
// parameter (`?next=`, `?redirect=`). Pure and free of server imports: the OAuth callback
// route and the client auth pages share this one rule (S6, NX-07).

/** Destination used when the requested one is missing or not allowed. */
export const DEFAULT_REDIRECT_PATH = '/lobby';

/** Throwaway origin for parsing; a candidate that resolves to any other origin is rejected. */
const PARSE_ORIGIN = 'http://same-origin.invalid';

const BACKSLASH = '\\';
/** Last C0 control character (U+0000–U+001F: NUL, tab, CR, LF, ESC, …). */
const LAST_C0_CONTROL = 0x1f;
/** DEL and the C1 control characters (U+007F–U+009F). */
const FIRST_DEL_OR_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;

function isControlCode(code: number): boolean {
    return code <= LAST_C0_CONTROL || (code >= FIRST_DEL_OR_C1_CONTROL && code <= LAST_C1_CONTROL);
}

function hasControlCharacter(value: string): boolean {
    for (let i = 0; i < value.length; i += 1) {
        if (isControlCode(value.charCodeAt(i))) return true;
    }
    return false;
}

/**
 * True for text that starts with exactly one `/` and holds no backslash and no control
 * character. Browsers read `//host` and `/\host` as another site, and drop tabs and
 * newlines before parsing (`/<tab>/host` becomes `//host`), so all of those are refused.
 */
function isSingleSlashPath(value: string): boolean {
    if (!value.startsWith('/') || value.startsWith('//')) return false;
    return !value.includes(BACKSLASH) && !hasControlCharacter(value);
}

/** `candidate` as the URL parser resolves it (dot segments removed), or null when it leaves this origin. */
function resolveOnSameOrigin(candidate: string): string | null {
    try {
        const url = new URL(candidate, PARSE_ORIGIN);
        return url.origin === PARSE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : null;
    } catch {
        return null;
    }
}

/**
 * The path to redirect to: `candidate` when it is a relative path on this site that starts
 * with exactly one `/`, otherwise `fallback`. Absolute URLs, anything with a scheme,
 * `//host`, `/\host`, backslashes and control characters are refused. The returned path is
 * the resolved one, so `/.//host` (which resolves to `//host`) is refused as well.
 */
export function safeRedirectPath(
    candidate: string | null | undefined,
    fallback: string = DEFAULT_REDIRECT_PATH,
): string {
    if (typeof candidate !== 'string' || !isSingleSlashPath(candidate)) return fallback;
    const resolved = resolveOnSameOrigin(candidate);
    return resolved !== null && isSingleSlashPath(resolved) ? resolved : fallback;
}
