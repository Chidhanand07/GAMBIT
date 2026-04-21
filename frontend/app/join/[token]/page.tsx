"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Timer, Zap, Flame, BookOpen, Loader2, Users } from 'lucide-react';
import { useSocket } from '@/components/SocketProvider';
import { createClient } from '@/lib/supabase/client';

function tcLabel(tc: string) {
    const min = parseInt(tc)
    if (min <= 2) return { label: 'Bullet', icon: <Zap size={18} strokeWidth={1.5} /> }
    if (min <= 5) return { label: 'Blitz', icon: <Flame size={18} strokeWidth={1.5} /> }
    if (min <= 15) return { label: 'Rapid', icon: <Timer size={18} strokeWidth={1.5} /> }
    return { label: 'Classical', icon: <BookOpen size={18} strokeWidth={1.5} /> }
}

export default function JoinPage({ params }: { params: { token: string } }) {
    const router = useRouter()
    const socket = useSocket()
    const [game, setGame] = useState<any>(null)
    const [me, setMe] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [joining, setJoining] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'

    useEffect(() => {
        Promise.all([
            fetch(`${socketUrl}/api/games/join/${params.token}`).then(r => r.ok ? r.json() : null),
            fetch('/api/profile/me').then(r => r.ok ? r.json() : null),
        ]).then(([g, m]) => {
            setGame(g)
            setMe(m)
            setLoading(false)
        })
    }, [params.token])

    // Creator: join game room via socket and listen for friend to accept
    useEffect(() => {
        if (!socket || !game || !me) return
        const isCreator = me.id === game.white_id || me.id === game.black_id
        if (!isCreator) return

        socket.emit('authenticate', me.id)
        socket.emit('join_game', game.id)

        const onGameStart = (data: { id: string }) => {
            router.push(`/game/${data.id}`)
        }
        socket.on('game_start', onGameStart)
        return () => { socket.off('game_start', onGameStart) }
    }, [socket, game, me, router])

    const handleJoin = async () => {
        if (!me) { router.push(`/login?redirect=/join/${params.token}`); return }
        setJoining(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.push(`/login?redirect=/join/${params.token}`); return }
            const res = await fetch(`${socketUrl}/api/games/join/${params.token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({}),
            })
            if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to join'); setJoining(false); return }
            const data = await res.json()
            router.push(`/game/${data.id}`)
        } catch (e: any) {
            setError(e.message)
            setJoining(false)
        }
    }

    if (loading) return (
        <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    )

    if (!game) return (
        <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center gap-4 text-center px-4">
            <div className="text-6xl">♟</div>
            <h1 className="text-2xl font-medium text-text-primary">Invite expired or not found</h1>
            <p className="text-text-secondary text-sm">This invite link is invalid or has expired (48h limit).</p>
            <Link href="/lobby" className="mt-4 px-6 py-3 bg-accent hover:bg-accent-hover text-surface rounded-lg font-medium transition-colors">
                Go to Lobby
            </Link>
        </div>
    )

    const creatorIsWhite = !!game.white_id
    const creator = creatorIsWhite ? game.white : game.black
    const tc = tcLabel(game.time_control)
    const isCreator = me?.id === game.white_id || me?.id === game.black_id

    return (
        <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden">

                {/* Header */}
                <div className="px-6 pt-6 pb-4 text-center border-b border-border bg-elevated">
                    <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-3 text-3xl">
                        ♟
                    </div>
                    <h1 className="text-xl font-medium text-text-primary">You're invited to play!</h1>
                    <p className="text-text-secondary text-sm mt-1">
                        <span className="text-accent font-medium">{creator?.username ?? 'A player'}</span> challenged you to a game
                    </p>
                </div>

                {/* Game details */}
                <div className="px-6 py-5 space-y-3">
                    <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                        <span className="text-text-secondary text-sm">Time Control</span>
                        <span className="flex items-center gap-1.5 text-text-primary text-sm font-medium">
                            <span className="text-accent">{tc.icon}</span>
                            {tc.label} · {game.time_control} min
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                        <span className="text-text-secondary text-sm">Rated</span>
                        <span className={`text-sm font-medium ${game.is_rated ? 'text-accent' : 'text-text-tertiary'}`}>
                            {game.is_rated ? 'Yes' : 'Casual'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                        <span className="text-text-secondary text-sm">Your color</span>
                        <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                            {isCreator
                                ? (creatorIsWhite ? <>♔ White</> : <>♚ Black</>)
                                : (creatorIsWhite ? <>♚ Black</> : <>♔ White</>)
                            }
                        </span>
                    </div>
                </div>

                {/* Action */}
                <div className="px-6 pb-6 space-y-3">
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    {isCreator ? (
                        <div className="text-center py-3 text-text-secondary text-sm flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                            Waiting for opponent to join...
                        </div>
                    ) : (
                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            {joining ? <><Loader2 size={18} className="animate-spin" /> Joining...</> : <><Users size={18} strokeWidth={1.5} /> Accept & Play</>}
                        </button>
                    )}
                    <Link href="/lobby" className="block text-center text-text-tertiary text-sm hover:text-text-secondary transition-colors py-1">
                        Decline
                    </Link>
                </div>
            </div>
        </div>
    )
}
