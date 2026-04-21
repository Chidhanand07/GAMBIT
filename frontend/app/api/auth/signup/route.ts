import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    const { email, password, username } = await request.json()

    if (!email || !password || !username) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not set in frontend/.env.local')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Admin client — full access to create user + profile
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if username is already taken before creating the auth user
    const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()

    if (existing) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 })
    }

    // Create the auth user via admin (bypasses email rate limits on the anon endpoint)
    const { data: created, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
    })

    if (authError) {
        const msg = authError.message.toLowerCase().includes('already registered') ||
                    authError.message.toLowerCase().includes('already exists')
            ? 'An account with this email already exists'
            : authError.message
        return NextResponse.json({ error: msg }, { status: 400 })
    }

    if (!created?.user) {
        return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 400 })
    }

    const { error: profileError } = await admin.from('profiles').insert({
        id: created.user.id,
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
    })

    if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        const msg = profileError.message.includes('unique')
            ? 'Username already taken'
            : profileError.message
        return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Return ok — client will sign in using the browser client directly
    return NextResponse.json({ ok: true })
}
