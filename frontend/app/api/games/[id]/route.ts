import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function makeAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    const cookieStore = cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => cookieStore.get(name)?.value,
                set: () => {},
                remove: () => {},
            },
            auth: { autoRefreshToken: false, persistSession: false },
        }
    )

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null

    const admin = makeAdmin()
    const { data: game, error } = await admin
        .from('games')
        .select(`
            *,
            white:profiles!games_white_id_fkey(id, username, display_name, avatar_url, rating_rapid, rating_blitz, rating_bullet, rating_classical),
            black:profiles!games_black_id_fkey(id, username, display_name, avatar_url, rating_rapid, rating_blitz, rating_bullet, rating_classical)
        `)
        .eq('id', params.id)
        .single()

    if (error || !game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Determine caller's color
    let myColor: 'white' | 'black' | 'spectator' = 'spectator'
    if (user) {
        if (game.white_id === user.id) myColor = 'white'
        else if (game.black_id === user.id) myColor = 'black'
    }

    return NextResponse.json({ ...game, myColor })
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const cookieStore = cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => cookieStore.get(name)?.value,
                set: () => {},
                remove: () => {},
            },
            auth: { autoRefreshToken: false, persistSession: false },
        }
    )
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const admin = makeAdmin()

    // Verify caller is a participant in this game before allowing any update
    const { data: game } = await admin
        .from('games')
        .select('white_id, black_id')
        .eq('id', params.id)
        .maybeSingle()

    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.white_id !== user.id && game.black_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Restrict which fields a player can PATCH (prevent status/winner tampering)
    const body = await req.json()
    const allowed = ['draw_offer', 'rematch_requested'] // only safe client-writable fields
    const filtered = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
    if (Object.keys(filtered).length === 0) {
        return NextResponse.json({ error: 'No writable fields' }, { status: 400 })
    }

    const { data, error } = await admin
        .from('games')
        .update(filtered)
        .eq('id', params.id)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}
