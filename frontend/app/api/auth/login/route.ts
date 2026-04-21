import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    const { email, password } = await request.json()

    if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Auth is performed server-side so session cookies are set directly on the
    // HTTP response. This guarantees the middleware can read them on the next
    // request, which @supabase/ssr@0.1.0 browser client can't ensure (large
    // JWTs fall back to localStorage, invisible to server cookies).
    let authResponse = NextResponse.json({ ok: true })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => request.cookies.get(name)?.value,
                set: (name: string, value: string, options: Record<string, unknown>) => {
                    authResponse.cookies.set(name, value, options as Parameters<typeof authResponse.cookies.set>[2])
                },
                remove: (name: string, options: Record<string, unknown>) => {
                    authResponse.cookies.set(name, '', { ...options as Parameters<typeof authResponse.cookies.set>[2], maxAge: 0 })
                },
            },
        }
    )

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        const msg = error.message.toLowerCase().includes('email not confirmed')
            ? 'Please confirm your email before signing in.'
            : 'Invalid email or password'
        return NextResponse.json({ error: msg }, { status: 401 })
    }

    if (!data.session) {
        return NextResponse.json({ error: 'Please confirm your email before signing in.' }, { status: 401 })
    }

    return authResponse
}
