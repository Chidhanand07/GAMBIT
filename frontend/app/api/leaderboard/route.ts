import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const VALID_FIELDS = new Set([
    'rating_rapid', 'rating_bullet', 'rating_blitz', 'rating_classical'
])

export async function GET(request: NextRequest) {
    const field = request.nextUrl.searchParams.get('field') ?? 'rating_rapid'

    if (!VALID_FIELDS.has(field)) {
        return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin
        .from('profiles')
        .select(`username, display_name, ${field}, games_played, wins, losses, draws`)
        .order(field, { ascending: false })
        .limit(50)

    if (error) {
        console.error('[api/leaderboard] error:', error.message)
        return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(data ?? [])
}
