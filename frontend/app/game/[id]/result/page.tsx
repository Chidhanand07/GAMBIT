'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { useGameReview } from '@/features/game-result/hooks/useGameReview';
import { mergeClassifications, playerName, replayPositions, tallyClassifications } from '@/features/game-result/review';
import { PlayerCard } from '@/features/game-result/components/PlayerCard';
import { ReviewBoard } from '@/features/game-result/components/ReviewBoard';
import { EvalGraph } from '@/features/game-result/components/EvalGraph';
import { MoveCaption, ReviewControls, ReviewMoveList } from '@/features/game-result/components/ReviewMoves';
import { ReviewStatusScreen } from '@/features/game-result/components/ReviewChrome';

export default function GameResultPage({ params }: { params: { id: string } }) {
    const { game, status, flipped, setFlipped } = useGameReview(params.id);
    const [ply, setPly] = useState(0);

    const moves = useMemo(() => mergeClassifications(game), [game]);
    const positions = useMemo(() => replayPositions(moves), [moves]);
    const counts = useMemo(
        () => ({
            white: tallyClassifications(game?.white_move_classifications),
            black: tallyClassifications(game?.black_move_classifications),
        }),
        [game],
    );

    if (status !== 'ready' || !game) return <ReviewStatusScreen status={status} />;

    const curFen = positions[Math.min(ply, positions.length - 1)] || new Chess().fen();
    const curMove = ply > 0 ? moves[ply - 1] : null;
    const wName = playerName(game.white, 'White');
    const bName = playerName(game.black, 'Black');

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-semibold text-text-primary mb-6">Game Review</h1>
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6">
                <PlayerCard
                    name={wName}
                    color="White"
                    accuracy={game.white_accuracy}
                    rating={game.white?.rating_rapid}
                    counts={counts.white}
                />

                {/* Center: board + eval graph + controls */}
                <div className="flex flex-col items-center">
                    <div className="w-full max-w-[480px]">
                        <ReviewBoard fen={curFen} flipped={flipped} curMove={curMove} />
                        <EvalGraph moves={moves} ply={ply} onSeek={setPly} />
                        <MoveCaption curMove={curMove} prevFen={positions[ply - 1]} />
                        <ReviewControls ply={ply} total={moves.length} setPly={setPly} setFlipped={setFlipped} />
                    </div>
                </div>

                <PlayerCard
                    name={bName}
                    color="Black"
                    accuracy={game.black_accuracy}
                    rating={game.black?.rating_rapid}
                    counts={counts.black}
                />
            </div>

            <ReviewMoveList moves={moves} ply={ply} onSeek={setPly} />

            <div className="mt-6 text-center">
                <Link href="/lobby" className="text-accent hover:underline">
                    Back to lobby
                </Link>
            </div>
        </div>
    );
}
