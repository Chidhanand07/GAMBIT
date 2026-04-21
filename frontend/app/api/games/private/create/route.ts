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

function nanoid(len: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    const bytes = new Uint8Array(len)
    crypto.getRandomValues(bytes)
    for (const b of bytes) result += chars[b % chars.length]
    return result
}

export async function POST(req: NextRequest) {
    const cookieStore = cookies()
    const userId = getUserId(cookieStore)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { timeControl, color, isRated } = await req.json()
    if (!timeControl) return NextResponse.json({ error: 'timeControl required' }, { status: 400 })

    const token = nanoid(10)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 48)

    const colorLower = (color || 'random').toLowerCase()
    let white_id: string | null = null
    let black_id: string | null = null
    if (colorLower === 'white') white_id = userId
    else if (colorLower === 'black') black_id = userId
    else if (Math.random() > 0.5) white_id = userId
    else black_id = userId

    const admin = makeAdmin()
    const { data, error } = await admin.from('games').insert({
        white_id,
        black_id,
        time_control: timeControl,
        status: 'waiting',
        invite_token: token,
        invite_expires_at: expiresAt.toISOString(),
        is_rated: isRated ?? false,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ token: data.invite_token, game_id: data.id })
}
