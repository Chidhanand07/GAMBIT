'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ExchangeHandler() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [errMsg, setErrMsg] = useState<string | null>(null)

    useEffect(() => {
        const next = searchParams.get('next') ?? '/lobby'
        const code = searchParams.get('code')

        // PKCE flow: code is in the URL query string
        if (code) {
            const supabase = createClient()
            supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
                if (error) {
                    console.error('[auth/exchange] PKCE exchange failed:', error.message)
                    setErrMsg(error.message)
                    setTimeout(() => router.replace('/login?error=oauth_failed'), 2000)
                    return
                }
                router.replace(next)
            })
            return
        }

        // Implicit flow: access_token is in the URL hash (never sent to server)
        const hash = window.location.hash.substring(1)
        if (hash) {
            const params = new URLSearchParams(hash)
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')

            if (accessToken && refreshToken) {
                const supabase = createClient()
                supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
                    .then(({ error }) => {
                        if (error) {
                            setErrMsg(error.message)
                            setTimeout(() => router.replace('/login?error=oauth_failed'), 2000)
                            return
                        }
                        router.replace(next)
                    })
                return
            }
        }

        // Nothing to work with
        router.replace('/login?error=oauth_failed')
    }, [router, searchParams])

    if (errMsg) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-400 text-sm">
                Sign-in error: {errMsg}
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    )
}

export default function ExchangePage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
            }
        >
            <ExchangeHandler />
        </Suspense>
    )
}
