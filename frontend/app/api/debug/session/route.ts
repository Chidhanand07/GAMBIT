import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    const cookieStore = cookies()
    const allCookies = cookieStore.getAll()

    // @supabase/ssr 0.1.0 uses get/set/remove, not getAll/setAll
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => cookieStore.get(name)?.value,
                set: () => {},
                remove: () => {},
            },
        }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    let profileResult: unknown = null
    let profileError: string | null = null

    if (user && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )
        const { data, error } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle()
        profileResult = data
        profileError = error?.message ?? null
    }

    return NextResponse.json({
        cookieNames: allCookies.map(c => c.name),
        authError: authError?.message ?? null,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        serviceKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        profileRowExists: profileResult !== null,
        profileData: profileResult,
        profileError,
    })
}
