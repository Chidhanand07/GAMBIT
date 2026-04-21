import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function makeAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

function getUserId(cookieStore: ReturnType<typeof cookies>): string | null {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
    const base = `sb-${ref}-auth-token`
    const single = cookieStore.get(base)?.value
    const raw = single ?? (() => {
        const chunks: string[] = []
        for (let i = 0; i < 10; i++) {
            const c = cookieStore.get(`${base}.${i}`)
            if (!c) break
            chunks.push(c.value)
        }
        return chunks.join('') || null
    })()
    if (!raw) return null
    try {
        let s: any
        try { s = JSON.parse(raw) } catch { s = JSON.parse(decodeURIComponent(raw)) }
        const token = s?.access_token as string | undefined
        if (!token || token.split('.').length !== 3) return null
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(Buffer.from(part + '='.repeat((4 - part.length % 4) % 4), 'base64').toString())
        const now = Math.floor(Date.now() / 1000)
        if (typeof payload.exp === 'number' && payload.exp < now - 60) return null
        return payload.sub ?? null
    } catch { return null }
}

// GET /api/games/active — returns the caller's active game row, or null.
// Also cleans up stale games whose clock_deadline has passed (server restart survivors).
export async function GET() {
    const cookieStore = cookies()
    const userId = getUserId(cookieStore)
    if (!userId) return NextResponse.json(null)

    const admin = makeAdmin()
    const { data } = await admin
        .from('games')
        .select('id, white_id, black_id, time_control, status, started_at, clock_deadline, white_time_ms, black_time_ms')
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!data) return NextResponse.json(null)

    // If clock_deadline exists and has passed by >10 seconds, the game timed out
    // while the server was down. Mark it abandoned so the lobby clears.
    if (data.clock_deadline) {
        const deadlineMs = new Date(data.clock_deadline).getTime()
        if (Date.now() > deadlineMs + 10_000) {
            // Determine who ran out of time: the player whose clock was running when deadline was set
            // We can't know for sure without FEN, so just mark as abandoned (no winner)
            await admin.from('games').update({
                status: 'completed',
                result: 'abandoned',
                ended_at: new Date().toISOString(),
            }).eq('id', data.id).eq('status', 'active')

            return NextResponse.json(null)
        }
    }

    // Also treat extremely old active games (>2 hours with no moves) as stale
    const startedAt = new Date(data.started_at).getTime()
    const twoHoursMs = 2 * 60 * 60 * 1000
    const hasMoves = data.white_time_ms !== null || data.black_time_ms !== null
    if (!hasMoves && Date.now() - startedAt > twoHoursMs) {
        await admin.from('games').update({
            status: 'completed',
            result: 'abandoned',
            ended_at: new Date().toISOString(),
        }).eq('id', data.id).eq('status', 'active')

        return NextResponse.json(null)
    }

    return NextResponse.json(data)
}
