// The browser-safe Supabase key. Canonical name NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the new
// `sb_publishable_…` key); the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY is read as a fallback so an
// existing deployment keeps working until its variables are renamed (SEC-05).
//
// Both names are written out as literal `process.env.X` accesses: that is the only form Next.js
// inlines into the client bundle.

const SECRET_KEY_PREFIX = 'sb_secret_';

/** The publishable (or legacy anon) key, or undefined when neither variable is set. */
export function supabasePublicKey(): string | undefined {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // A secret key bypasses RLS. If one is ever pasted into a public variable, refuse to use it
    // rather than ship it to every browser (Supabase also rejects secret keys sent from browsers).
    if (key?.startsWith(SECRET_KEY_PREFIX)) {
        throw new Error(
            'A Supabase secret key was found in a NEXT_PUBLIC_ variable. Put the publishable key in ' +
                'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and rotate the secret key.',
        );
    }
    return key || undefined;
}
