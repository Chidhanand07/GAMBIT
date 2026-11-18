'use client'

import { Suspense } from 'react'
import { useSignInExchange } from '@/features/auth/hooks/useSignInExchange'

function ExchangeHandler() {
    const errMsg = useSignInExchange()

    if (errMsg) {
        return (
            <div role="alert" className="min-h-screen flex items-center justify-center text-danger text-[14px]">
                Sign-in error: {errMsg}
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div role="status" aria-label="Signing in" className="w-8 h-8 border-2 border-line border-t-accent rounded-full motion-safe:animate-spin" />
        </div>
    )
}

export default function ExchangePage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div role="status" aria-label="Signing in" className="w-8 h-8 border-2 border-line border-t-accent rounded-full motion-safe:animate-spin" />
                </div>
            }
        >
            <ExchangeHandler />
        </Suspense>
    )
}
