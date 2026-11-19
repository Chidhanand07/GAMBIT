"use client";

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { CenteredCard } from '@/components/layout/CenteredCard';
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
        <CenteredCard
            title="You're invited to play!"
            subtitle={
                <>
                    <span className="font-semibold text-accent">{creator?.username ?? 'A player'}</span> challenged
                    you to a game
                </>
            }
        >
            <InviteDetails game={game} isCreator={isCreator} creatorIsWhite={creatorIsWhite} />
            <InviteActions error={error} isCreator={isCreator} joining={joining} onJoin={() => void join()} />
        </CenteredCard>
    )
}
