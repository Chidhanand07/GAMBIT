import { NextResponse, type NextRequest } from 'next/server';
import { confirmDeletion, deleteAccountEverywhere, logRef } from '@/lib/server/accountDeletion';
import { requireFreshUser } from '@/lib/server/identity';
import { enforceStrictRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createAdminClient, createUserClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// Irreversible account change: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

// POST /api/account/delete — body { confirmUsername, password? } (ADR F-145).
// Order: fresh session (+ AAL2 when two-factor is on) → strict rate limit → typed username →
// password or a recent sign-in → ban → data (one transaction) → avatar files → auth user.
export async function POST(request: NextRequest) {
    const auth = await requireFreshUser();
    if (!auth.ok) return auth.response;

    const limited = await enforceStrictRateLimit(auth.userId, RATE_LIMITS.deleteAccount);
    if (limited) return limited;

    const body = await parseJsonBody(request, schemas.accountDelete);
    if (!body.ok) return body.response;

    const admin = createAdminClient();
    const confirmed = await confirmDeletion(admin, auth.session, body.data);
    if (!confirmed.ok) return NextResponse.json({ error: confirmed.error }, { status: confirmed.status });

    const deleted = await deleteAccountEverywhere(admin, auth.userId);
    if (!deleted.ok) return NextResponse.json({ error: deleted.error }, { status: deleted.status });

    console.warn(`[account/delete] account deleted (ref ${logRef(auth.userId)})`);
    // The session's cookies go too (the user no longer exists).
    await (await createUserClient()).auth.signOut({ scope: 'local' }).catch(() => {});
    return NextResponse.json({ deleted: true });
}
