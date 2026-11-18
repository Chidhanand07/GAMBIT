import { NextResponse } from 'next/server';
import { requireFreshUser, requireUser } from '@/lib/server/identity';
import {
    getOwnPreferences,
    preferencesUpdateFromPatch,
    saveOwnPreferences,
    toPreferencesPayload,
} from '@/lib/server/preferences';
import { createUserClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// Per-user data: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;

// GET /api/settings — my preferences; `stored: false` (and the defaults) until I first save.
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const { data, error } = await getOwnPreferences(await createUserClient(), auth.userId);
    if (error) {
        console.error('[api/settings] read failed:', error.message);
        return NextResponse.json({ error: 'Could not load settings' }, { status: HTTP_SERVER_ERROR });
    }
    return NextResponse.json(toPreferencesPayload(data as Record<string, unknown> | null));
}

// PATCH /api/settings — body { play?, notifications?, privacy?, security? }; omitted keys are kept.
export async function PATCH(request: Request) {
    const auth = await requireFreshUser();
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody(request, schemas.preferencesPatch, 'Invalid settings');
    if (!body.ok) return body.response;
    const update = preferencesUpdateFromPatch(body.data);
    if (!update) return NextResponse.json({ error: 'No settings to update' }, { status: HTTP_BAD_REQUEST });

    // The caller's own session: RLS and the column grants decide what may change (SEC-03).
    const { data, error } = await saveOwnPreferences(await createUserClient(), auth.userId, update);
    if (error || !data) {
        console.error('[api/settings] save failed:', error?.message);
        return NextResponse.json({ error: 'Could not save settings' }, { status: HTTP_SERVER_ERROR });
    }
    return NextResponse.json(toPreferencesPayload(data));
}
