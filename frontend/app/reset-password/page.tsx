"use client";

import { useState } from 'react'
import Link from 'next/link'
import { KeyRound, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle')
    const [message, setMessage] = useState('')
    
    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        setStatus('loading')
        
        const supabase = createClient()
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        
        if (error) {
            setMessage(error.message)
            setStatus('error')
        } else {
            setMessage('A password reset link has been sent to your email.')
            setStatus('success')
        }
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-surface border border-border p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="text-center mb-8">
                    <h1 className="text-2xl text-text-primary font-medium flex items-center justify-center gap-3">
                        <KeyRound size={24} className="text-accent"/> Reset Password
                    </h1>
                </div>
                
                {status === 'error' && <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-6">{message}</div>}
                
                {status === 'success' ? (
                    <div className="text-center">
                        <div className="bg-indicator-green/10 border border-indicator-green text-indicator-green text-sm p-4 rounded-lg mb-6">
                            {message}
                        </div>
                        <Link href="/login" className="inline-flex items-center gap-2 text-accent hover:underline">
                            <ArrowLeft size={16} /> Back to Login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                        <div>
                            <label className="block text-text-secondary text-sm mb-1">Email address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent" />
                        </div>
                        
                        <button type="submit" disabled={status === 'loading'} className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-surface font-medium py-3 rounded-lg transition-colors flex justify-center items-center gap-2 mt-2">
                            {status === 'loading' ? <div className="w-5 h-5 border-2 border-surface border-t-transparent rounded-full animate-spin"></div> : 'Send Reset Link'}
                        </button>
                    </form>
                )}
                
                {status !== 'success' && (
                    <div className="mt-8 text-center">
                        <Link href="/login" className="text-text-secondary text-sm hover:text-text-primary hover:underline">
                            Cancel
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}
