import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: { username: string } }
) {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '15'), 50)
    const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0')

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Resolve username to UUID
    const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', params.username)
        .maybeSingle()

    if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: games, error } = await admin
        .from('games')
        .select(`
            id, time_control, status, result, winner_id,
            white_accuracy, black_accuracy, created_at, ended_at,
            white_id, black_id,
            white:profiles!games_white_id_fkey(username, display_name, rating_rapid, rating_blitz, rating_bullet, rating_classical),
            black:profiles!games_black_id_fkey(username, display_name, rating_rapid, rating_blitz, rating_bullet, rating_classical)
        `)
        .or(`white_id.eq.${profile.id},black_id.eq.${profile.id}`)
        .in('status', ['completed', 'finished', 'ended'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (error) {
        console.error('[api/profile/games] error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ games: games ?? [], profileId: profile.id })
}
