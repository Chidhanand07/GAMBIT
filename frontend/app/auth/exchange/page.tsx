'use client'

import { Suspense } from 'react'
import { useSignInExchange } from '@/features/auth/hooks/useSignInExchange'

function ExchangeHandler() {
    const errMsg = useSignInExchange()

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
