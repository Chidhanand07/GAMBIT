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

export async function GET(
    _req: NextRequest,
    { params }: { params: { username: string } }
) {
    const cookieStore = cookies()
    const meId = getUserId(cookieStore)
    if (!meId) return NextResponse.json({ status: 'none' })

    const admin = makeAdmin()

    const { data: them } = await admin
        .from('profiles').select('id').eq('username', params.username).maybeSingle()
    if (!them) return NextResponse.json({ status: 'none' })
    if (them.id === meId) return NextResponse.json({ status: 'self' })

    const { data } = await admin
        .from('friendships')
        .select('status, requester_id')
        .or(`and(requester_id.eq.${meId},addressee_id.eq.${them.id}),and(requester_id.eq.${them.id},addressee_id.eq.${meId})`)
        .maybeSingle()

    if (!data) return NextResponse.json({ status: 'none' })
    if (data.status === 'accepted') return NextResponse.json({ status: 'friends' })
    if (data.status === 'pending') {
        return NextResponse.json({
            status: data.requester_id === meId ? 'pending_sent' : 'pending_received'
        })
    }
    return NextResponse.json({ status: 'none' })
}
