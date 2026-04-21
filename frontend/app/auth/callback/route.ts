import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function makeAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

async function ensureProfile(userId: string, email: string, avatarUrl: string | null) {
    const admin = makeAdmin()
    const { data: existing } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (existing) return

    const base = (email.split('@')[0] ?? 'player').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 15) || 'player'
    let username = base
    for (let i = 1; i <= 99; i++) {
        const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
        if (!taken) break
        username = `${base}${i}`
    }

    await admin.from('profiles').insert({
        id: userId,
        username,
        avatar_url: avatarUrl ?? null,
        rating_bullet: 1200,
        rating_blitz: 1200,
        rating_rapid: 1200,
        rating_classical: 1200,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        created_at: new Date().toISOString(),
    })
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/lobby'
    const errorParam = searchParams.get('error')

    if (errorParam) {
        return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(errorParam)}`, request.url)
        )
    }

    if (!code) {
        return NextResponse.redirect(new URL('/login?error=no_code', request.url))
    }

    const response = NextResponse.redirect(new URL(next, request.url))

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return request.cookies.get(name)?.value },
                set(name: string, value: string, options: object) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    response.cookies.set(name, value, options as any)
                },
                remove(name: string, options: object) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    response.cookies.set(name, '', options as any)
                },
            },
        }
    )

    // Retry up to 3 times with backoff if rate-limited
    let lastError: Error | null = null
    let exchangedUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(1500 * attempt)
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.user) {
            exchangedUser = data.user
            break
        }
        lastError = error ?? new Error('Unknown error')
        if (!error?.message.toLowerCase().includes('rate limit')) break
    }

    if (!exchangedUser) {
        console.error('[auth/callback] exchange failed:', lastError?.message)
        return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(lastError?.message ?? 'oauth_failed')}`, request.url)
        )
    }

    // Auto-create profile for OAuth users (Google, GitHub, etc.)
    try {
        await ensureProfile(
            exchangedUser.id,
            exchangedUser.email ?? '',
            (exchangedUser.user_metadata?.avatar_url as string | null) ?? null
        )
    } catch (err) {
        console.error('[auth/callback] profile ensure failed:', err)
        // Non-fatal — user can still proceed
    }

    return response
}
