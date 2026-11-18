'use client';

import type { Lobby } from '../hooks/useLobby';
import { selectionName } from '../lobbyModel';
import { ComputerSetup } from './ComputerSetup';
import { FriendsChallenge } from './FriendsChallenge';
import { MatchmakingStatus } from './MatchmakingStatus';

/** Under the "You're playing" bar: the queue status and the open Computer / Friend panel. */
export function LobbyPlayArea({ lobby }: { lobby: Lobby }) {
    const { matchmaking } = lobby.online;
    const name = selectionName(lobby.timeControl.selectedTc);
    const { computer } = lobby;
    return (
        <div id="stage" className="flex flex-col gap-4">
            {matchmaking.searching && (
                <MatchmakingStatus
                    timeControlName={name}
                    elapsed={matchmaking.searchTime}
                    onCancel={matchmaking.cancelSearch}
                />
            )}
            {lobby.stage === 'computer' && (
                <ComputerSetup
                    difficulty={computer.difficulty}
                    side={computer.side}
                    onDifficulty={computer.setDifficulty}
                    onSide={computer.setSide}
                    onClose={lobby.closeStage}
                />
            )}
            {lobby.stage === 'friends' && (
                <FriendsChallenge
                    friends={lobby.friends}
                    timeControlName={name}
                    onInviteLink={lobby.invite.show}
                    onClose={lobby.closeStage}
                />
            )}
        </div>
    );
}
