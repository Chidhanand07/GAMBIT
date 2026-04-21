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

export async function POST(req: NextRequest) {
    const cookieStore = cookies()
    const meId = getUserId(cookieStore)
    if (!meId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { addressee_username } = await req.json()
    if (!addressee_username) return NextResponse.json({ error: 'addressee_username required' }, { status: 400 })

    const admin = makeAdmin()

    const { data: them } = await admin
        .from('profiles').select('id').eq('username', addressee_username).maybeSingle()
    if (!them) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (them.id === meId) return NextResponse.json({ error: 'Cannot friend yourself' }, { status: 400 })

    // Check if friendship already exists in either direction
    const { data: existing } = await admin
        .from('friendships')
        .select('id, status')
        .or(`and(requester_id.eq.${meId},addressee_id.eq.${them.id}),and(requester_id.eq.${them.id},addressee_id.eq.${meId})`)
        .maybeSingle()

    if (existing) {
        if (existing.status === 'accepted') return NextResponse.json({ error: 'Already friends' }, { status: 400 })
        if (existing.status === 'pending') return NextResponse.json({ success: true, already: true })
    }

    const { error } = await admin
        .from('friendships')
        .insert({ requester_id: meId, addressee_id: them.id, status: 'pending' })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}
