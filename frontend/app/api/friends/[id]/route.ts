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

// PUT /api/friends/[id]?action=accept|decline
export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const cookieStore = cookies()
    const meId = getUserId(cookieStore)
    if (!meId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'accept' && action !== 'decline') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const admin = makeAdmin()
    const newStatus = action === 'accept' ? 'accepted' : 'declined'

    const { error } = await admin
        .from('friendships')
        .update({ status: newStatus })
        .eq('id', params.id)
        .eq('addressee_id', meId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

// DELETE /api/friends/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    const cookieStore = cookies()
    const meId = getUserId(cookieStore)
    if (!meId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = makeAdmin()
    const { error } = await admin
        .from('friendships')
        .delete()
        .eq('id', params.id)
        .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}
