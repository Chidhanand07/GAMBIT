import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function classifyTc(tc: string): 'bullet' | 'blitz' | 'rapid' | 'classical' {
    const mins = parseInt(tc) || 10
    if (mins <= 2) return 'bullet'
    if (mins <= 5) return 'blitz'
    if (mins <= 15) return 'rapid'
    return 'classical'
}

export async function GET(
    _req: NextRequest,
    { params }: { params: { username: string } }
) {
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
        .from('profiles')
        .select('id, games_played, wins, losses, draws, rating_bullet, rating_blitz, rating_rapid, rating_classical')
        .eq('username', params.username)
        .maybeSingle()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Fetch all completed games for this user
    const { data: games } = await admin
        .from('games')
        .select('id, time_control, winner_id, result, white_id, black_id')
        .or(`white_id.eq.${profile.id},black_id.eq.${profile.id}`)
        .in('status', ['completed', 'finished', 'ended'])

    type CategoryStats = { played: number; wins: number; losses: number; draws: number }
    const stats: Record<string, CategoryStats> = {
        bullet: { played: 0, wins: 0, losses: 0, draws: 0 },
        blitz: { played: 0, wins: 0, losses: 0, draws: 0 },
        rapid: { played: 0, wins: 0, losses: 0, draws: 0 },
        classical: { played: 0, wins: 0, losses: 0, draws: 0 },
    }

    for (const game of games ?? []) {
        const cat = classifyTc(game.time_control ?? '10')
        stats[cat].played++
        if (game.result === 'draw') {
            stats[cat].draws++
        } else if (game.winner_id === profile.id) {
            stats[cat].wins++
        } else {
            stats[cat].losses++
        }
    }

    return NextResponse.json({
        total: profile.games_played ?? 0,
        wins: profile.wins ?? 0,
        losses: profile.losses ?? 0,
        draws: profile.draws ?? 0,
        ratings: {
            bullet: profile.rating_bullet ?? 1200,
            blitz: profile.rating_blitz ?? 1200,
            rapid: profile.rating_rapid ?? 1200,
            classical: profile.rating_classical ?? 1200,
        },
        byCategory: stats,
    })
}
