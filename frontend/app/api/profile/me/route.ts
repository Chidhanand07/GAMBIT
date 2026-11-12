import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/identity';
import { createDefaultProfile, getProfileById, updateProfile } from '@/lib/server/profiles';
import { createAdminClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

// GET /api/profile/me — my profile; auto-creates a default one when missing
export async function GET() {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const admin = createAdminClient();
    const { data, error } = await getProfileById(admin, userId);

    if (error) {
        console.error('[api/profile/me] query error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        console.warn('[api/profile/me] no profile for user:', userId, '— auto-creating');
        const created = await createDefaultProfile(admin, userId);
        if (!created) return NextResponse.json({ error: 'Profile not found', userId }, { status: 404 });
        return NextResponse.json(created);
    }

    return NextResponse.json(data);
}

// PATCH /api/profile/me — body { displayName, bio, country, avatarUrl? }
export async function PATCH(request: Request) {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const body = await parseJsonBody(request, schemas.profilePatch, 'Invalid profile fields');
    if (!body.ok) return body.response;
    const { displayName, bio, country, avatarUrl } = body.data;

    const updatePayload: Record<string, unknown> = {
        display_name: displayName ?? null,
        bio: bio ?? null,
        country: country ?? null,
    };
    if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl;

    const { data, error } = await updateProfile(createAdminClient(), userId, updatePayload);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
