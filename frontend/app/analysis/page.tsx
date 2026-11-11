'use client';

import { useState } from 'react';
import { useAnalysisBoard } from '@/features/analysis/hooks/useAnalysisBoard';
import { useEngineAnalysis } from '@/features/analysis/hooks/useEngineAnalysis';
import { useImportForm } from '@/features/analysis/hooks/useImportForm';
import { EvalBar } from '@/features/analysis/components/EvalBar';
import { AnalysisBoard } from '@/features/analysis/components/AnalysisBoard';
import { BoardControls } from '@/features/analysis/components/BoardControls';
import { EnginePanel } from '@/features/analysis/components/EnginePanel';
import { FenFooter, MoveList, TabBar } from '@/features/analysis/components/AnalysisSidebar';
import { ImportPanel } from '@/features/analysis/components/ImportPanel';
import type { AnalysisTab } from '@/features/analysis/types';

const COPIED_LABEL_MS = 1500;

export default function AnalysisPage() {
    const board = useAnalysisBoard();
    const { game, moveHistory, currentMoveIndex, navigateToMove } = board;
    const engine = useEngineAnalysis(game?.fen());
    const [isFlipped, setIsFlipped] = useState(false);
    const [activeTab, setActiveTab] = useState<AnalysisTab>('analysis');
    const [fenCopied, setFenCopied] = useState(false);
    const form = useImportForm({
        loadPosition: board.loadPosition,
        loadPgn: board.loadPgn,
        onLoaded: () => setActiveTab('analysis'),
    });

    const copyFen = () => {
        if (!game) return;
        void navigator.clipboard.writeText(game.fen());
        setFenCopied(true);
        setTimeout(() => setFenCopied(false), COPIED_LABEL_MS);
    };

    const resetBoard = () => {
        board.reset();
        engine.setEngineData(null);
    };

    if (!game)
        return (
            <div className="flex justify-center p-20">
                <div
                    className="w-8 h-8 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
                />
            </div>
        );

    return (
        <div className="flex h-[calc(100vh-53px)] overflow-hidden page-enter bg-page">
            <EvalBar engineData={engine.engineData} />

            {/* ── BOARD COLUMN ── */}
            <div className="flex flex-col items-center justify-center flex-1 min-w-0 py-4 gap-3">
                <AnalysisBoard
                    game={game}
                    isFlipped={isFlipped}
                    selectedSquare={board.selectedSquare}
                    legalTargets={board.legalTargets}
                    lastMove={moveHistory[currentMoveIndex]}
                    onSquareClick={board.handleSquareClick}
                />
                <BoardControls
                    currentMoveIndex={currentMoveIndex}
                    total={moveHistory.length}
                    onNavigate={navigateToMove}
                    onFlip={() => setIsFlipped((v) => !v)}
                    onReset={resetBoard}
                />
            </div>

            {/* ── RIGHT PANEL ── */}
            <div
                className="w-[300px] shrink-0 flex flex-col my-4 mr-4 rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
            >
                <TabBar activeTab={activeTab} onChange={setActiveTab} />

                {activeTab === 'analysis' && (
                    <div className="flex flex-col flex-1 min-h-0">
                        <EnginePanel
                            enabled={engine.engineEnabled}
                            onToggle={() => engine.setEngineEnabled((v) => !v)}
                            data={engine.engineData}
                        />
                        <MoveList
                            moveHistory={moveHistory}
                            currentMoveIndex={currentMoveIndex}
                            onNavigate={navigateToMove}
                        />
                        <FenFooter fen={game.fen()} copied={fenCopied} onCopy={copyFen} />
                    </div>
                )}

                {activeTab === 'import' && (
                    <ImportPanel
                        customFen={form.customFen}
                        onCustomFen={form.setCustomFen}
                        customPgn={form.customPgn}
                        onCustomPgn={form.setCustomPgn}
                        onQuickPosition={form.loadQuickPosition}
                        onLoadFen={form.loadCustomFen}
                        onLoadPgn={form.loadCustomPgn}
                    />
                )}
            </div>
        </div>
    );
}
