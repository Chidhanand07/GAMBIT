// Client-side fetch helpers for /api/settings (ADR F-140). Raw Responses: callers check `ok`.

const NO_STORE: RequestInit = { cache: 'no-store' };

/** GET /api/settings — my stored preferences (401 when signed out). */
export function fetchSettings(): Promise<Response> {
    return fetch('/api/settings', { ...NO_STORE });
}

/** PATCH /api/settings with any subset of { play, notifications, privacy, security }. */
export function patchSettings(body: object): Promise<Response> {
    return fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
