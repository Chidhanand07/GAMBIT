import 'server-only';

// Server-side secrets (NX-05, NX-06, SEC-01). Never import this from client code: the
// `server-only` marker turns that into a build error.

/** Names the secret Supabase key is read from, in order of preference. */
const SECRET_KEY_NAMES = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'] as const;

/**
 * Name of the variable the secret key comes from, or null when none is set. Canonical:
 * SUPABASE_SECRET_KEY (the new `sb_secret_…` key). The legacy service_role names are fallbacks.
 */
export function supabaseSecretKeySource(): (typeof SECRET_KEY_NAMES)[number] | null {
    return SECRET_KEY_NAMES.find((name) => Boolean(process.env[name])) ?? null;
}

/** The secret (RLS-bypassing) Supabase key, or undefined when none is configured. */
export function supabaseSecretKey(): string | undefined {
    const source = supabaseSecretKeySource();
    return source ? process.env[source] : undefined;
}
