import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Account changes that go through Supabase Auth on the caller's own session (ADR F-143).

/** Where the confirmation link lands: verifies the token, then shows the settings page. */
export const EMAIL_CONFIRM_PATH = '/auth/confirm';
export const AFTER_EMAIL_CONFIRM_PATH = '/settings';

export type EmailChangeResult =
    { ok: true; pendingEmail: string } | { ok: false; status: 400 | 409 | 429 | 500; message: string };

interface AuthErrorLike {
    message: string;
    status?: number;
    code?: string;
}

const HTTP_TOO_MANY_REQUESTS = 429;

/** The answer for an Auth error, by code first (supabase-js `AuthApiError.code`). */
function emailChangeError(error: AuthErrorLike): EmailChangeResult {
    if (error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message))
        return { ok: false, status: 409, message: 'An account with this email already exists.' };
    if (error.status === HTTP_TOO_MANY_REQUESTS || error.code === 'over_email_send_rate_limit')
        return { ok: false, status: 429, message: 'Too many emails were sent. Try again later.' };
    if (error.code === 'email_address_invalid' || error.code === 'validation_failed')
        return { ok: false, status: 400, message: 'That email address is not valid.' };
    // No e-mail address in the log line (SEC-01).
    console.error('[account/email] updateUser failed:', error.code ?? error.status, error.message);
    return { ok: false, status: 500, message: 'Could not change your email. Try again.' };
}

/**
 * Asks Supabase Auth to change the signed-in user's e-mail. Nothing changes until the user follows
 * the confirmation link(s) Supabase mails (one to the new address, and one to the current address
 * when "Secure email change" is on). `origin` builds the link's redirect (allow-listed in Supabase).
 */
export async function requestEmailChange(
    userClient: Pick<SupabaseClient, 'auth'>,
    email: string,
    origin: string,
): Promise<EmailChangeResult> {
    const redirect = `${origin}${EMAIL_CONFIRM_PATH}?next=${encodeURIComponent(AFTER_EMAIL_CONFIRM_PATH)}`;
    const { data, error } = await userClient.auth.updateUser({ email }, { emailRedirectTo: redirect });
    if (error) return emailChangeError(error);
    return { ok: true, pendingEmail: data.user?.new_email ?? email };
}
