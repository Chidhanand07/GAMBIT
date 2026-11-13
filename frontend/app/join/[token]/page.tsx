"use client";

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import { fetchInviteGame, fetchMyProfile } from '@/lib/api/invite';
import { useJoinInvite } from '@/features/join/hooks/useJoinInvite';
import { InviteDetails } from '@/features/join/components/InviteDetails';
import { InviteActions, InviteExpired, InviteLoading } from '@/features/join/components/InviteScreens';
import type { GameWithPlayers } from '@/types/game';
import type { Profile } from '@/types/profile';

export default function JoinPage(props: { params: Promise<{ token: string }> }) {
    const params = use(props.params);
    const router = useRouter()
    const socket = useSocket()
    const [game, setGame] = useState<GameWithPlayers | null>(null)
    const [me, setMe] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'
    const { joining, error, join } = useJoinInvite({ socketUrl, token: params.token, signedIn: me !== null })

    useEffect(() => {
        void Promise.all([fetchInviteGame(socketUrl, params.token), fetchMyProfile()]).then(([g, m]) => {
            setGame(g)
            setMe(m)
            setLoading(false)
        })
    }, [params.token, socketUrl])

    // Creator: join game room via socket and listen for friend to accept
    useEffect(() => {
        if (!socket || !game || !me) return
        const isCreator = me.id === game.white_id || me.id === game.black_id
        if (!isCreator) return

        socket.emit('join_game', game.id)

        const onGameStart = (data: { id: string }) => {
            router.push(`/game/${data.id}`)
        }
        socket.on('game_start', onGameStart)
        return () => { socket.off('game_start', onGameStart) }
    }, [socket, game, me, router])

    if (loading) return <InviteLoading />

    if (!game) return <InviteExpired />

    const creatorIsWhite = !!game.white_id
    const creator = creatorIsWhite ? game.white : game.black
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
                <InviteDetails game={game} isCreator={isCreator} creatorIsWhite={creatorIsWhite} />

                {/* Action */}
                <InviteActions error={error} isCreator={isCreator} joining={joining} onJoin={() => void join()} />
            </div>
        </div>
    )
}
