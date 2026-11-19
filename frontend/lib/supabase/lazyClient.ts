import type { SupabaseClient } from '@supabase/supabase-js';

// The browser Supabase client, loaded on first use (NX-18, F-111). The providers in the root
// layout only need it after hydration, so supabase-js stays out of every page's first-load
// JavaScript and off the landing page's critical path.

let pending: Promise<SupabaseClient> | null = null;

/** The shared browser client (lib/supabase/client.ts), imported the first time it is asked for. */
export function loadBrowserClient(): Promise<SupabaseClient> {
    pending ??= import('./client').then((m) => m.createClient());
    // A failed load (offline, missing env) is not cached: the next caller tries again.
    pending.catch(() => {
        pending = null;
    });
    return pending;
}
