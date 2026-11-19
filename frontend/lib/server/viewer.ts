import 'server-only';
import type { Viewer, ViewerProfile } from '@/types/viewer';
import { getVerifiedUserId } from './identity';
import { createUserClient } from './supabase';

// The viewer of a public page (the landing): verified claims first (identity.ts), then the
// viewer's own profile read AS that user, so RLS and the column grants apply (NX-08, SEC-03).

const VIEWER_COLUMNS = 'id, username, display_name, avatar_url, rating_rapid';

const GUEST: Viewer = { status: 'guest' };
const UNKNOWN: Viewer = { status: 'unknown' };

/** The allow-listed fields of a profile row (NX-04); null when the row is not usable. */
export function toViewerProfile(row: Record<string, unknown> | null): ViewerProfile | null {
    if (!row || typeof row.id !== 'string' || typeof row.username !== 'string') return null;
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
        id: row.id,
        username: row.username,
        display_name: text(row.display_name),
        avatar_url: text(row.avatar_url),
        rating_rapid: typeof row.rating_rapid === 'number' ? row.rating_rapid : null,
    };
}

/**
 * The current request's viewer. Reads the request cookies, so a page that calls it renders per
 * request and is never cached (NX-11). Failures after a verified session give `unknown`.
 */
export async function getViewer(): Promise<Viewer> {
    const userId = await getVerifiedUserId();
    if (!userId) return GUEST;
    try {
        const client = await createUserClient();
        const { data, error } = await client.from('profiles').select(VIEWER_COLUMNS).eq('id', userId).maybeSingle();
        const profile = error ? null : toViewerProfile(data);
        return profile ? { status: 'signed-in', profile } : UNKNOWN;
    } catch (e) {
        console.error('[viewer] could not read the viewer profile:', (e as Error)?.message ?? e);
        return UNKNOWN;
    }
}
