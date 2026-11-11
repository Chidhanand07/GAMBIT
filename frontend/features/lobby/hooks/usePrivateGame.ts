import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createPrivateGame } from '@/lib/api/lobby';
import type { PrivateColor } from '@/types/lobby';
import type { LobbyTimeControlId } from '@/types/timeControl';
import { privateTimeControl } from '../timeControls';
import type { InviteState } from '../types';

const COPIED_FEEDBACK_MS = 2000;

interface PrivateGameOptions {
    socket: Socket | null;
    /** Lobby custom sliders; used when the private time control is "custom". */
    customMin: number;
    customInc: number;
}

/**
 * State of the "Play a Friend" flow. Lives in the page (not the modal) so the
 * chosen options, invite link and room survive closing and reopening the modal.
 */
export function usePrivateGame({ socket, customMin, customInc }: PrivateGameOptions) {
    const [inviteState, setInviteState] = useState<InviteState>('config');
    const [privateTc, setPrivateTc] = useState<LobbyTimeControlId>('rapid');
    const [privateColor, setPrivateColor] = useState<PrivateColor>('random');
    const [privateRated, setPrivateRated] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [inviteGameId, setInviteGameId] = useState<string | null>(null);
    const [justCopied, setJustCopied] = useState(false);

    // Join the private game's room as soon as the invite exists.
    useEffect(() => {
        if (!socket || !inviteGameId) return;
        socket.emit('join_game', inviteGameId);
    }, [socket, inviteGameId]);

    const createInvite = async () => {
        setInviteState('generating');
        try {
            const data = await createPrivateGame({
                timeControl: privateTimeControl(privateTc, customMin, customInc),
                color: privateColor,
                isRated: privateRated,
            });
            if (data.token) {
                setInviteLink(`${window.location.origin}/join/${data.token}`);
                setInviteGameId(data.game_id ?? null);
                setInviteState('share');
            } else {
                console.error('Private game error:', data.error);
                setInviteState('config');
            }
        } catch {
            setInviteState('config');
        }
    };

    const copyInviteLink = async () => {
        await navigator.clipboard.writeText(inviteLink);
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
    };

    return {
        inviteState,
        setInviteState,
        privateTc,
        setPrivateTc,
        privateColor,
        setPrivateColor,
        privateRated,
        toggleRated: () => setPrivateRated((v: boolean) => !v),
        inviteLink,
        inviteGameId,
        justCopied,
        createInvite,
        copyInviteLink,
    };
}

export type PrivateGame = ReturnType<typeof usePrivateGame>;
