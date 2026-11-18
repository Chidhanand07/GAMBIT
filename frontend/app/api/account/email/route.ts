import { NextResponse, type NextRequest } from 'next/server';
import { requestEmailChange } from '@/lib/server/account';
import { requireFreshUser } from '@/lib/server/identity';
import { enforceStrictRateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';
import { createUserClient } from '@/lib/server/supabase';
import { parseJsonBody, schemas } from '@/lib/server/validation';

// Per-user account change: never prerendered or cached (NX-11).
export const dynamic = 'force-dynamic';

const HTTP_BAD_REQUEST = 400;

// POST /api/account/email — body { email }. Starts Supabase's change-email confirmation; the
// address changes only when the link(s) Supabase mails are followed (ADR F-143).
export async function POST(request: NextRequest) {
    const auth = await requireFreshUser();
    if (!auth.ok) return auth.response;

    // Per verified user, before any Auth call; fails closed (each request sends mail).
    const limited = await enforceStrictRateLimit(auth.userId, RATE_LIMITS.changeEmail);
    if (limited) return limited;

    const body = await parseJsonBody(request, schemas.emailChange, 'Enter a valid email address.');
    if (!body.ok) return body.response;

    const userClient = await createUserClient();
    const { data } = await userClient.auth.getUser();
    if (data.user?.email?.toLowerCase() === body.data.email) {
        return NextResponse.json({ error: 'That is already your email.' }, { status: HTTP_BAD_REQUEST });
    }

    const result = await requestEmailChange(userClient, body.data.email, request.nextUrl.origin);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({ pending: true, email: result.pendingEmail });
}
