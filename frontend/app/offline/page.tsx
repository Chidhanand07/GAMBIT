"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { RotateCcw, Undo2, Flag, Cpu, Zap, Brain, Swords } from 'lucide-react';
import Piece from '@/components/ui/Piece';
import { playMoveSound, playCaptureSound, playCheckSound, playGameEndSound, playGameStartSound } from '@/lib/sounds';

type Difficulty = 'easy' | 'medium' | 'hard';
type ColorChoice = 'w' | 'b' | 'random';
type Phase = 'setup' | 'playing';

const DIFFICULTIES: { id: Difficulty; label: string; desc: string; Icon: any }[] = [
    { id: 'easy',   label: 'Easy',   desc: 'Plays your style — makes real mistakes',  Icon: Zap },
    { id: 'medium', label: 'Medium', desc: 'Plays like you, but avoids blunders',      Icon: Brain },
    { id: 'hard',   label: 'Hard',   desc: 'Style moves sharpened by Stockfish',       Icon: Swords },
];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export default function ComputerPage() {
    const [phase, setPhase] = useState<Phase>('setup');
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [colorChoice, setColorChoice] = useState<ColorChoice>('w');

    const [game] = useState(() => new Chess());
    const [fen, setFen] = useState(game.fen());
    const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [legalMoves, setLegalMoves] = useState<string[]>([]);
    const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
    const [thinking, setThinking] = useState(false);
    const [resigned, setResigned] = useState(false);
    const [engineError, setEngineError] = useState<string | null>(null);

    const thinkingRef = useRef(false);

    const refresh = useCallback(() => {
        setFen(game.fen());
        setMoveHistory(game.history());
    }, [game]);

    const gameOver = game.isGameOver() || resigned;

    // Play a sound appropriate to the move just made.
    const soundFor = (result: any) => {
        if (game.isCheckmate()) { playGameEndSound(false); return; }
        if (game.inCheck()) { playCheckSound(); return; }
        if (result?.captured) { playCaptureSound(); return; }
        playMoveSound();
    };

    // Ask MAVERICK for a move and apply it.
    const maverickMove = useCallback(async () => {
        if (thinkingRef.current) return;
        if (game.isGameOver()) return;
        thinkingRef.current = true;
        setThinking(true);
        setEngineError(null);
        const startedAt = Date.now();
        try {
            const res = await fetch('/api/maverick-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: game.fen(), difficulty }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.detail || body?.error || `Engine error (${res.status})`);
            }
            const data = await res.json();
            // Keep a minimum "thinking" beat so the move feels natural, not instant.
            const elapsed = Date.now() - startedAt;
            if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));

            const result = game.move({ from: data.uci.slice(0, 2), to: data.uci.slice(2, 4), promotion: data.uci.slice(4) || 'q' });
            if (result) {
                setLastMove({ from: result.from, to: result.to });
                soundFor(result);
                refresh();
                if (game.isGameOver()) playGameEndSound(false);
            }
        } catch (e: any) {
            setEngineError(e?.message || 'MAVERICK is unavailable. Is the engine running?');
        } finally {
            thinkingRef.current = false;
            setThinking(false);
        }
    }, [game, difficulty, refresh]);

    // Start a new game with the chosen color + difficulty.
    const startGame = useCallback(() => {
        const resolved: 'w' | 'b' = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
        game.reset();
        setPlayerColor(resolved);
        setSelectedSquare(null);
        setLegalMoves([]);
        setLastMove(null);
        setResigned(false);
        setEngineError(null);
        refresh();
        setPhase('playing');
        playGameStartSound();
        // If the player is Black, MAVERICK (White) moves first.
        if (resolved === 'b') setTimeout(() => maverickMove(), 500);
    }, [colorChoice, game, refresh, maverickMove]);

    const handleSquareClick = (square: string) => {
        if (gameOver || thinking) return;
        if (game.turn() !== playerColor) return; // not your turn

        if (selectedSquare) {
            if (selectedSquare === square) {
                setSelectedSquare(null);
                setLegalMoves([]);
                return;
            }
            let result: any = null;
            try {
                result = game.move({ from: selectedSquare, to: square, promotion: 'q' });
            } catch { result = null; }

            if (result) {
                setSelectedSquare(null);
                setLegalMoves([]);
                setLastMove({ from: result.from, to: result.to });
                soundFor(result);
                refresh();
                if (!game.isGameOver()) setTimeout(() => maverickMove(), 250);
                else playGameEndSound(true);
            } else {
                // Reselect if clicking own piece
                const piece = game.get(square as Square);
                if (piece && piece.color === playerColor) {
                    setSelectedSquare(square);
                    setLegalMoves(game.moves({ square: square as Square, verbose: true }).map((m: any) => m.to));
                } else {
                    setSelectedSquare(null);
                    setLegalMoves([]);
                }
            }
        } else {
            const piece = game.get(square as Square);
            if (piece && piece.color === playerColor) {
                setSelectedSquare(square);
                setLegalMoves(game.moves({ square: square as Square, verbose: true }).map((m: any) => m.to));
            }
        }
    };

    const undoMove = () => {
        if (thinking) return;
        // Undo both MAVERICK's reply and your move so it's your turn again.
        game.undo();
        if (game.turn() !== playerColor) game.undo();
        setSelectedSquare(null);
        setLegalMoves([]);
        setResigned(false);
        const hist = game.history({ verbose: true });
        const last = hist[hist.length - 1];
        setLastMove(last ? { from: last.from, to: last.to } : null);
        refresh();
    };

    const resign = () => { if (!gameOver) { setResigned(true); playGameEndSound(false); } };

    const backToSetup = () => { setPhase('setup'); };

    // Orientation: player's color at the bottom.
    const orderedRanks = playerColor === 'w' ? RANKS : [...RANKS].reverse();
    const orderedFiles = playerColor === 'w' ? FILES : [...FILES].reverse();

    const renderSquare = (file: string, rank: string) => {
        const square = (file + rank) as Square;
        const piece = game.get(square);
        const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isLegal = legalMoves.includes(square);
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const isCheck = piece?.type === 'k' && piece?.color === game.turn() && game.inCheck();

        return (
            <div
                key={square}
                onClick={() => handleSquareClick(square)}
                className={`w-full aspect-square flex items-center justify-center relative cursor-pointer
                    ${isLight ? 'bg-board-light' : 'bg-board-dark'}`}
            >
                {isLast && <div className="absolute inset-0 bg-yellow-400/30 pointer-events-none" />}
                {isSelected && <div className="absolute inset-0 bg-amber-300/45 pointer-events-none" />}
                {isCheck && <div className="absolute inset-0 bg-red-500/60 pointer-events-none" />}

                {file === orderedFiles[0] && (
                    <span className="absolute top-0.5 left-0.5 text-[10px] font-bold opacity-70 z-10 select-none"
                        style={{ color: isLight ? '#B58863' : '#F0D9B5' }}>{rank}</span>
                )}
                {rank === orderedRanks[orderedRanks.length - 1] && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-bold opacity-70 z-10 select-none"
                        style={{ color: isLight ? '#B58863' : '#F0D9B5' }}>{file}</span>
                )}

                {piece && <div className="w-full h-full flex items-center justify-center z-20"><Piece color={piece.color} type={piece.type} /></div>}

                {isLegal && (
                    <div className={`absolute z-30 pointer-events-none ${piece ? 'w-full h-full border-4 border-black/25 rounded-full' : 'w-1/3 h-1/3 bg-black/25 rounded-full'}`} />
                )}
            </div>
        );
    };

    // ── SETUP SCREEN ──────────────────────────────────────────────────────────
    if (phase === 'setup') {
        return (
            <div className="max-w-2xl mx-auto px-4 py-10 text-text-primary">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                        <Cpu size={26} className="text-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold">Play MAVERICK</h1>
                        <p className="text-text-secondary text-sm">Your personal style bot — trained on your own games.</p>
                    </div>
                </div>

                <div className="mb-6">
                    <h2 className="text-sm uppercase tracking-[0.1em] text-text-tertiary font-medium mb-3">Difficulty</h2>
                    <div className="grid gap-2.5">
                        {DIFFICULTIES.map(d => (
                            <button key={d.id} onClick={() => setDifficulty(d.id)}
                                className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
                                style={{
                                    background: difficulty === d.id ? 'var(--bg-hover)' : 'var(--bg-surface)',
                                    borderColor: difficulty === d.id ? 'var(--accent)' : 'var(--border)',
                                }}>
                                <d.Icon size={22} className={difficulty === d.id ? 'text-accent' : 'text-text-tertiary'} />
                                <div>
                                    <div className="font-medium">{d.label}</div>
                                    <div className="text-sm text-text-secondary">{d.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-8">
                    <h2 className="text-sm uppercase tracking-[0.1em] text-text-tertiary font-medium mb-3">Play as</h2>
                    <div className="grid grid-cols-3 gap-2.5">
                        {([
                            { id: 'w', label: 'White', glyph: '♔' },
                            { id: 'random', label: 'Random', glyph: '⚄' },
                            { id: 'b', label: 'Black', glyph: '♚' },
                        ] as { id: ColorChoice; label: string; glyph: string }[]).map(c => (
                            <button key={c.id} onClick={() => setColorChoice(c.id)}
                                className="flex flex-col items-center gap-1.5 py-4 rounded-xl border transition-all"
                                style={{
                                    background: colorChoice === c.id ? 'var(--bg-hover)' : 'var(--bg-surface)',
                                    borderColor: colorChoice === c.id ? 'var(--accent)' : 'var(--border)',
                                }}>
                                <span className="text-3xl leading-none" style={{ color: c.id === 'b' ? '#111' : c.id === 'w' ? '#fff' : 'var(--text-secondary)', WebkitTextStroke: c.id === 'w' ? '1px #000' : undefined }}>{c.glyph}</span>
                                <span className="text-sm font-medium">{c.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <button onClick={startGame}
                    className="w-full h-12 rounded-xl font-semibold btn-press transition-colors"
                    style={{ background: 'var(--accent)', color: '#0F0D0B' }}>
                    Start Game
                </button>
            </div>
        );
    }

    // ── GAME SCREEN ───────────────────────────────────────────────────────────
    const maverickColor = playerColor === 'w' ? 'b' : 'w';
    const resultText = resigned ? 'You resigned'
        : game.isCheckmate() ? (game.turn() === playerColor ? 'MAVERICK wins by checkmate' : 'You win by checkmate!')
        : game.isStalemate() ? 'Stalemate' : game.isDraw() ? 'Draw' : 'Game over';

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 text-text-primary mb-12">
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 max-w-[600px] mx-auto w-full">
                    {/* MAVERICK header */}
                    <div className="flex items-center justify-between bg-surface p-3 rounded-t-xl border border-border-strong px-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-accent/15 rounded-full flex items-center justify-center"><Cpu size={20} className="text-accent" /></div>
                            <div>
                                <span className="font-medium">MAVERICK</span>
                                <span className="ml-2 text-xs uppercase tracking-wide text-text-tertiary">{difficulty}</span>
                            </div>
                        </div>
                        {thinking && (
                            <span className="flex items-center gap-2 text-sm text-text-secondary">
                                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                                Thinking…
                            </span>
                        )}
                    </div>

                    <div className="w-full relative shadow-[-10px_10px_30px_rgba(0,0,0,0.5)] border-[12px] border-[#2E2B25] rounded-sm">
                        <div className="grid grid-cols-8 grid-rows-8 w-full aspect-square">
                            {orderedRanks.map(rank => orderedFiles.map(file => renderSquare(file, rank)))}
                        </div>
                        {gameOver && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
                                <div className="bg-surface border border-border p-6 rounded-xl text-center space-y-4">
                                    <h2 className="text-2xl font-bold text-accent">Game Over</h2>
                                    <p className="text-text-primary">{resultText}</p>
                                    <div className="flex gap-2">
                                        <button onClick={startGame} className="bg-accent text-surface px-5 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors">Rematch</button>
                                        <button onClick={backToSetup} className="bg-elevated border border-border-strong px-5 py-2 rounded-lg font-medium hover:bg-hover transition-colors">New Setup</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* You footer */}
                    <div className="flex items-center justify-between bg-surface p-3 rounded-b-xl border border-border-strong px-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-elevated rounded-full flex items-center justify-center border border-border-strong text-lg font-bold" style={{ color: playerColor === 'w' ? '#fff' : '#111', WebkitTextStroke: playerColor === 'w' ? '1px #000' : undefined }}>{playerColor === 'w' ? '♔' : '♚'}</div>
                            <span className="font-medium">You</span>
                        </div>
                        <span className="text-xs text-text-tertiary">{game.turn() === playerColor && !gameOver ? 'Your move' : ''}</span>
                    </div>

                    {engineError && (
                        <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                            {engineError}
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <button onClick={undoMove} disabled={moveHistory.length === 0 || thinking || gameOver}
                            className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary disabled:opacity-50 py-3 rounded-lg transition-colors font-medium">
                            <Undo2 size={18} strokeWidth={1.5} /> Takeback
                        </button>
                        <button onClick={resign} disabled={gameOver}
                            className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary disabled:opacity-50 py-3 rounded-lg transition-colors font-medium">
                            <Flag size={18} strokeWidth={1.5} /> Resign
                        </button>
                        <button onClick={backToSetup}
                            className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary py-3 rounded-lg transition-colors font-medium">
                            <RotateCcw size={18} strokeWidth={1.5} /> New Game
                        </button>
                    </div>
                </div>

                {/* Move log */}
                <div className="w-full lg:w-[300px]">
                    <div className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden max-h-[500px]">
                        <div className="p-4 border-b border-border bg-elevated font-medium">Moves</div>
                        <div className="p-4 overflow-y-auto space-y-1">
                            {moveHistory.length === 0 ? <p className="text-text-tertiary text-sm italic">No moves yet.</p> : null}
                            {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                                <div key={i} className="flex gap-4 text-sm font-mono">
                                    <span className="w-6 text-text-tertiary text-right">{i + 1}.</span>
                                    <span className="w-16 text-text-primary">{moveHistory[i * 2]}</span>
                                    <span className="w-16 text-text-secondary">{moveHistory[i * 2 + 1] || ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
