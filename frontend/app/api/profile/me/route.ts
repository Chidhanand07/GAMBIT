import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function makeAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

// Read + reassemble the Supabase auth cookie (may be chunked across multiple cookies)
function getRawAuthCookie(cookieStore: ReturnType<typeof cookies>): string | null {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
    const baseName = `sb-${ref}-auth-token`

    const single = cookieStore.get(baseName)
    if (single?.value) return single.value

    const chunks: string[] = []
    for (let i = 0; i < 10; i++) {
        const chunk = cookieStore.get(`${baseName}.${i}`)
        if (!chunk) break
        chunks.push(chunk.value)
    }
    return chunks.length > 0 ? chunks.join('') : null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1]
        if (!part) return null
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    } catch { return null }
}

// Parse the user ID from the auth cookie without any Supabase Auth network call.
// Mirrors the middleware's logic — if middleware passed, this will succeed.
function getUserId(cookieStore: ReturnType<typeof cookies>): string | null {
    const raw = getRawAuthCookie(cookieStore)
    if (!raw) return null
    try {
        let session: Record<string, unknown>
        try { session = JSON.parse(raw) } catch { session = JSON.parse(decodeURIComponent(raw)) }

        const token = session?.access_token as string | undefined
        if (!token || token.split('.').length !== 3) return null

        const payload = decodeJwtPayload(token)
        if (!payload) return null

        const now = Math.floor(Date.now() / 1000)
        if (typeof payload.exp === 'number' && (payload.exp as number) < now - 60) return null

        return (payload.sub as string) ?? null
    } catch { return null }
}

async function createDefaultProfile(admin: SupabaseClient, userId: string) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser?.user?.email ?? ''
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 15) || 'player'

    let username = base
    for (let i = 1; i <= 99; i++) {
        const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
        if (!existing) break
        username = `${base}${i}`
    }

    const { data, error } = await admin.from('profiles').insert({
        id: userId,
        username,
        rating_bullet: 1200,
        rating_blitz: 1200,
        rating_rapid: 1200,
        rating_classical: 1200,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        created_at: new Date().toISOString(),
    }).select().single()

    if (error) {
        console.error('[api/profile/me] auto-create failed:', error.message)
        return null
    }
    return data
}

export async function GET() {
    const cookieStore = cookies()
    const userId = getUserId(cookieStore)

    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = makeAdmin()
    const { data, error } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()

    if (error) {
        console.error('[api/profile/me] query error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        console.warn('[api/profile/me] no profile for user:', userId, '— auto-creating')
        const created = await createDefaultProfile(admin, userId)
        if (!created) return NextResponse.json({ error: 'Profile not found', userId }, { status: 404 })
        return NextResponse.json(created)
    }

    return NextResponse.json(data)
}

export async function PATCH(request: Request) {
    const cookieStore = cookies()
    const userId = getUserId(cookieStore)

    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    const { displayName, bio, country, avatarUrl } = body

    const updatePayload: Record<string, unknown> = {
        display_name: displayName ?? null,
        bio: bio ?? null,
        country: country ?? null,
    }
    if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl

    const admin = makeAdmin()
    const { data, error } = await admin
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}
