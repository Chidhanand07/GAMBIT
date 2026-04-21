import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
    _request: NextRequest,
    { params }: { params: { username: string } }
) {
    if (!params.username) {
        return NextResponse.json({ error: 'Username required' }, { status: 400 })
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('username', params.username)
        .maybeSingle()

    if (error) {
        console.error('[api/profile/username] query error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json(data)
}
