import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

// GET /api/friends?userId=<uuid>  — list accepted friends for any user (for public profile)
// GET /api/friends                — list MY accepted friends (uses cookie)
export async function GET(req: NextRequest) {
    const cookieStore = cookies()
    const meId = getUserId(cookieStore)

    // Allow viewing friends of another user (public profile) via ?userId param
    const targetId = req.nextUrl.searchParams.get('userId') ?? meId
    if (!targetId) return NextResponse.json([])

    const admin = makeAdmin()
    const { data, error } = await admin
        .from('friendships')
        .select('id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url, rating_rapid), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url, rating_rapid)')
        .or(`requester_id.eq.${targetId},addressee_id.eq.${targetId}`)
        .eq('status', 'accepted')

    if (error) return NextResponse.json([])

    const seen = new Set()
    const friends = []
    for (const f of data ?? []) {
        const friend = f.requester_id === targetId ? f.addressee : f.requester
        if (!friend || seen.has(friend.id)) continue
        seen.add(friend.id)
        friends.push({ ...friend, friendship_id: f.id })
    }
    return NextResponse.json(friends)
}
