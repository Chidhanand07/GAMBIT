'use client';

import { useMemo, useState, use } from 'react';
import { Chess } from 'chess.js';
import { useGameReview } from '@/features/game-result/hooks/useGameReview';
import { mergeClassifications, playerName, replayPositions, tallyClassifications } from '@/features/game-result/review';
import { PlayerCard } from '@/features/game-result/components/PlayerCard';
import { ReviewBoard } from '@/features/game-result/components/ReviewBoard';
import { EvalGraph } from '@/features/game-result/components/EvalGraph';
import { MoveCaption, ReviewControls, ReviewMoveList } from '@/features/game-result/components/ReviewMoves';
import { ReviewStatusScreen } from '@/features/game-result/components/ReviewChrome';
import { analysisGameHref } from '@/features/analysis/links';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function GameResultPage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const { game, status, flipped, setFlipped, retry } = useGameReview(params.id);
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

    if (status !== 'ready' || !game) return <ReviewStatusScreen status={status} onRetry={retry} />;

    const curFen = positions[Math.min(ply, positions.length - 1)] || new Chess().fen();
    const curMove = ply > 0 ? moves[ply - 1] : null;
    const wName = playerName(game.white, 'White');
    const bName = playerName(game.black, 'Black');

    return (
        <div className="mx-auto box-border flex max-w-[1400px] flex-col gap-5 px-8 pb-16 pt-8">
            <div className="flex flex-col">
                <h1 className="m-0 font-display text-[30px] font-bold leading-[1.5] tracking-[-0.02em]">Game Review</h1>
                <span className="text-[14px] text-ink-muted">
                    {wName} vs {bName}
                </span>
            </div>
            <div className="flex flex-wrap items-start gap-6">
                <Card className="flex min-w-0 max-w-[720px] flex-[1_1_480px] flex-col gap-3">
                    <ReviewBoard fen={curFen} flipped={flipped} curMove={curMove} />
                    <EvalGraph moves={moves} ply={ply} onSeek={setPly} />
                    <MoveCaption curMove={curMove} prevFen={positions[ply - 1]} />
                    <ReviewControls ply={ply} total={moves.length} setPly={setPly} setFlipped={setFlipped} />
                </Card>
                <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
                    <PlayerCard
                        name={wName}
                        color="White"
                        accuracy={game.white_accuracy}
                        rating={game.white?.rating_rapid}
                        counts={counts.white}
                    />
                    <PlayerCard
                        name={bName}
                        color="Black"
                        accuracy={game.black_accuracy}
                        rating={game.black?.rating_rapid}
                        counts={counts.black}
                    />
                    <ReviewMoveList moves={moves} ply={ply} onSeek={setPly} />
                    <Button href={analysisGameHref(params.id)} variant="outline">
                        Open in analysis
                    </Button>
                    <Button href="/lobby" variant="outline">
                        Back to lobby
                    </Button>
                </aside>
            </div>
        </div>
    );
}
