'use client';

import { useEffect, useRef, useState } from 'react';
import { Board } from '@/components/chess/Board';
import { useAnalysisBoard } from '../hooks/useAnalysisBoard';
import { useEngineAnalysis } from '../hooks/useEngineAnalysis';
import { useImportForm } from '../hooks/useImportForm';
import type { AnalysisTab } from '../types';
import { AnalysisPanel, FenBox, MovesBox } from './AnalysisPanel';
import { AnalysisView } from './AnalysisView';
import { BoardControls } from './BoardControls';
import { EnginePanel } from './EnginePanel';
import { EvalBar } from './EvalBar';
import { ImportPanel } from './ImportPanel';

const COPIED_LABEL_MS = 1500;

/** "Copy" → "Copied" for 1.5 s after writing `text` to the clipboard. */
function useCopyLabel() {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
    const copy = (text: string) => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current ?? undefined);
        timer.current = setTimeout(() => setCopied(false), COPIED_LABEL_MS);
    };
    return { copied, copy };
}

/**
 * Wires the analysis screen: the local board and its line (useAnalysisBoard), the engine
 * evaluation through the game server's /api/analysis/engine (useEngineAnalysis), PGN/FEN import.
 */
export function AnalysisContainer() {
    const board = useAnalysisBoard();
    const { game, moveHistory, currentMoveIndex, navigateToMove } = board;
    const fen = game.fen();
    const engine = useEngineAnalysis(fen);
    const [flipped, setFlipped] = useState(false);
    const [tab, setTab] = useState<AnalysisTab>('analysis');
    const form = useImportForm({ loadPosition: board.loadPosition, loadPgn: board.loadPgn });
    const { copied, copy } = useCopyLabel();
    const last = moveHistory[currentMoveIndex];

    const analysis = (
        <>
            <EnginePanel
                enabled={engine.engineEnabled}
                onToggle={() => engine.setEngineEnabled((v) => !v)}
                data={engine.engineData}
                failed={engine.engineFailed}
            />
            <MovesBox
                moves={moveHistory.map((m) => m.san)}
                currentPly={currentMoveIndex}
                onSelectPly={navigateToMove}
            />
            <FenBox fen={fen} copied={copied} onCopy={() => copy(fen)} />
        </>
    );
    const importer = (
        <ImportPanel
            currentFen={fen}
            customFen={form.customFen}
            onCustomFen={form.setCustomFen}
            customPgn={form.customPgn}
            onCustomPgn={form.setCustomPgn}
            fenMessage={form.fenMessage}
            pgnMessage={form.pgnMessage}
            onQuickPosition={form.loadQuickPosition}
            onLoadFen={form.loadCustomFen}
            onLoadPgn={form.loadCustomPgn}
        />
    );

    return (
        <AnalysisView
            evalBar={<EvalBar data={engine.engineData} />}
            board={
                <Board
                    fen={fen}
                    orientation={flipped ? 'black' : 'white'}
                    selectedSquare={board.selectedSquare}
                    legalDestinations={board.legalTargets}
                    lastMove={last ? { from: last.from, to: last.to } : null}
                    onSquareClick={board.handleSquareClick}
                    showCoordinates
                    frame="analysis"
                    label={`Analysis board, ${game.turn() === 'w' ? 'white' : 'black'} to move`}
                />
            }
            controls={
                <BoardControls
                    currentMoveIndex={currentMoveIndex}
                    total={moveHistory.length}
                    onNavigate={navigateToMove}
                    onFlip={() => setFlipped((v) => !v)}
                />
            }
            panel={<AnalysisPanel tab={tab} onTab={setTab} analysis={analysis} importer={importer} />}
        />
    );
}
