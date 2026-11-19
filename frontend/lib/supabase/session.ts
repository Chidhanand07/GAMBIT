import { loadBrowserClient } from './lazyClient';

/**
 * True when this browser holds a Supabase session (read locally; refreshed if it has expired).
 * Lets a provider skip a per-user request a guest would only get a 401 for (F-111).
 */
export async function hasBrowserSession(): Promise<boolean> {
    const supabase = await loadBrowserClient();
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
}
