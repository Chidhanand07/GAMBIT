// Client-side fetch helpers for the account routes (ADRs F-143, F-145). Raw Responses: callers check `ok`.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** POST /api/account/email — start an e-mail change (confirmation link(s) are mailed). */
export function requestEmailChange(email: string): Promise<Response> {
    return fetch('/api/account/email', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email }) });
}
