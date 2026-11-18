// Two-factor authentication with Supabase Auth TOTP factors (ADR F-144). Browser-side: enrolment,
// challenges and unenrolment run against Supabase Auth with the user's own session, which is how
// Supabase's MFA API works; the servers check the resulting assurance level (AAL) themselves.
import type { SupabaseClient } from '@supabase/supabase-js';

type MfaClient = Pick<SupabaseClient, 'auth'>;

export type MfaResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** A TOTP code from an authenticator app: six digits. */
const CODE = /^\d{6}$/;
export const isTotpCode = (code: string) => CODE.test(code.trim());

const WRONG_CODE = 'That code is not right. Check your authenticator app and try again.';
const FAILED = 'Two-factor authentication could not be changed. Try again.';

export interface TwoFactorStatus {
    /** A verified TOTP factor exists. */
    enabled: boolean;
    /** Its id, when enabled. */
    factorId: string | null;
    /** The current session's level. */
    aal: 'aal1' | 'aal2' | null;
}

/** Whether this session must still enter a code: signed in with a password only, factor enrolled. */
export async function needsSecondFactor(client: MfaClient): Promise<boolean> {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return !error && data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2';
}

export async function twoFactorStatus(client: MfaClient): Promise<TwoFactorStatus> {
    const [{ data: factors }, { data: level }] = await Promise.all([
        client.auth.mfa.listFactors(),
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const factor = factors?.totp?.[0] ?? null;
    const aal = level?.currentLevel === 'aal2' ? 'aal2' : level?.currentLevel === 'aal1' ? 'aal1' : null;
    return { enabled: factor !== null, factorId: factor?.id ?? null, aal };
}

/** Raises the session to AAL2 with a code for `factorId` (challenge + verify). */
export async function verifyCode(client: MfaClient, factorId: string, code: string): Promise<MfaResult> {
    if (!isTotpCode(code)) return { ok: false, message: 'Enter the 6-digit code from your authenticator app.' };
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    return error ? { ok: false, message: WRONG_CODE } : { ok: true };
}

/** Sign-in: verify a code against the user's (first) verified TOTP factor. */
export async function verifySignInCode(client: MfaClient, code: string): Promise<MfaResult> {
    const { data } = await client.auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (!factor) return { ok: false, message: FAILED };
    return verifyCode(client, factor.id, code);
}

export interface Enrollment {
    factorId: string;
    /** SVG data URL of the QR code. */
    qrCode: string;
    /** The shared secret, for typing into an app by hand. */
    secret: string;
}

/** Starts enrolment: a new unverified TOTP factor with its QR code and secret. */
export async function startEnrollment(client: MfaClient): Promise<MfaResult<{ enrollment: Enrollment }>> {
    // Leftovers of an abandoned enrolment would make Supabase refuse a second one of the same name.
    const { data: existing } = await client.auth.mfa.listFactors();
    for (const stale of existing?.all?.filter((f) => f.factor_type === 'totp' && f.status !== 'verified') ?? []) {
        await client.auth.mfa.unenroll({ factorId: stale.id });
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Gambit' });
    if (error || !data || data.type !== 'totp') return { ok: false, message: FAILED };
    return { ok: true, enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

/** Abandons an enrolment that was never verified. */
export async function cancelEnrollment(client: MfaClient, factorId: string): Promise<void> {
    await client.auth.mfa.unenroll({ factorId });
}

/**
 * Turns two-factor off. Supabase only removes a verified factor from an AAL2 session, so an AAL1
 * session first proves the factor with `code`.
 */
export async function disableTwoFactor(client: MfaClient, factorId: string, code: string): Promise<MfaResult> {
    const verified = await verifyCode(client, factorId, code);
    if (!verified.ok) return verified;
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) return { ok: false, message: FAILED };
    // A new token without the factor in it (and back to AAL1).
    await client.auth.refreshSession();
    return { ok: true };
}
