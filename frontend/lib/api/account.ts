// Client-side fetch helpers for the account routes (ADRs F-143, F-145). Raw Responses: callers check `ok`.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** POST /api/account/email — start an e-mail change (confirmation link(s) are mailed). */
export function requestEmailChange(email: string): Promise<Response> {
    return fetch('/api/account/email', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email }) });
}

/** POST /api/account/delete — irreversible; the server re-authenticates first. */
export function requestAccountDeletion(body: { confirmUsername: string; password?: string }): Promise<Response> {
    return fetch('/api/account/delete', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}
