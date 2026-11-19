import { loadBrowserClient } from '@/lib/supabase/lazyClient';

/** Auth events after which the stored preferences belong to someone else (or no one). */
const RELOAD_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED']);

/**
 * Calls `onChange` after a sign-in, sign-out or account update in this tab, so the settings are
 * re-read from the right place. supabase-js loads on first use, never on the first paint (F-111,
 * F-168); without a client (missing env) there is nothing to watch.
 */
export function subscribeToAuthChanges(onChange: () => void): () => void {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    loadBrowserClient()
        .then((supabase) => {
            if (!active) return;
            const {
                data: { subscription },
            } = supabase.auth.onAuthStateChange((event) => {
                if (RELOAD_EVENTS.has(event)) onChange();
            });
            unsubscribe = () => subscription.unsubscribe();
        })
        .catch(() => {});
    return () => {
        active = false;
        unsubscribe?.();
    };
}
