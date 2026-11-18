import { createClient } from '@/lib/supabase/client';

/** Auth events after which the stored preferences belong to someone else (or no one). */
const RELOAD_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED']);

/**
 * Calls `onChange` after a sign-in, sign-out or account update in this tab, so the settings are
 * re-read from the right place. Without a Supabase client (missing env) there is nothing to watch.
 */
export function subscribeToAuthChanges(onChange: () => void): () => void {
    try {
        const {
            data: { subscription },
        } = createClient().auth.onAuthStateChange((event) => {
            if (RELOAD_EVENTS.has(event)) onChange();
        });
        return () => subscription.unsubscribe();
    } catch {
        return () => {};
    }
}
