"use client";

import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import {
    FlipHorizontal2, BarChart2, SkipBack, SkipForward,
    ChevronLeft, ChevronRight, RotateCcw, Copy, Check
} from 'lucide-react';

export default function AnalysisPage() {
    const [game, setGame] = useState<Chess | null>(null);
    const [moveHistory, setMoveHistory] = useState<any[]>([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [legalTargets, setLegalTargets] = useState<string[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [activeTab, setActiveTab] = useState<'analysis' | 'import'>('analysis');
    const [engineEnabled, setEngineEnabled] = useState(false);
    const [engineData, setEngineData] = useState<any>(null);
    const [customFen, setCustomFen] = useState('');
    const [customPgn, setCustomPgn] = useState('');
    const [fenCopied, setFenCopied] = useState(false);

    useEffect(() => { setGame(new Chess()); }, []);

    useEffect(() => {
        if (!engineEnabled || !game) { setEngineData(null); return; }
        let active = true;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'}/api/analysis/engine`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fen: game.fen(), depth: 18 }) }
                );
                const data = await res.json();
                if (active) setEngineData(data);
            } catch { /* engine offline */ }
        }, 500);
        return () => { active = false; clearTimeout(t); };
    }, [game?.fen(), engineEnabled]);

    const navigateToMove = useCallback((index: number) => {
        const g = new Chess();
        for (let i = 0; i <= index && i < moveHistory.length; i++) g.move(moveHistory[i]);
        setGame(g);
        setCurrentMoveIndex(index);
        setSelectedSquare(null);
        setLegalTargets([]);
    }, [moveHistory]);

    const handleSquareClick = useCallback((square: string) => {
        if (!game) return;
        if (selectedSquare) {
            const g = new Chess(game.fen());
            try {
                const move = g.move({ from: selectedSquare as any, to: square as any, promotion: 'q' });
                if (move) {
                    const newHistory = [...moveHistory.slice(0, currentMoveIndex + 1), move];
                    setMoveHistory(newHistory);
                    setCurrentMoveIndex(newHistory.length - 1);
                    setGame(g);
                }
            } catch {
                const piece = game.get(square as any);
                if (piece && piece.color === game.turn()) {
                    setSelectedSquare(square);
                    setLegalTargets(game.moves({ square: square as any, verbose: true } as any).map((m: any) => m.to));
                    return;
                }
            }
            setSelectedSquare(null);
            setLegalTargets([]);
        } else {
            const piece = game.get(square as any);
            if (piece && piece.color === game.turn()) {
                setSelectedSquare(square);
                setLegalTargets(game.moves({ square: square as any, verbose: true } as any).map((m: any) => m.to));
            }
        }
    }, [game, selectedSquare, moveHistory, currentMoveIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCurrentMoveIndex(prev => {
                    const next = Math.max(-1, prev - 1);
                    const g = new Chess();
                    for (let i = 0; i <= next && i < moveHistory.length; i++) g.move(moveHistory[i]);
                    setGame(g);
                    setSelectedSquare(null);
                    setLegalTargets([]);
                    return next;
                });
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setCurrentMoveIndex(prev => {
                    const next = Math.min(moveHistory.length - 1, prev + 1);
                    const g = new Chess();
                    for (let i = 0; i <= next && i < moveHistory.length; i++) g.move(moveHistory[i]);
                    setGame(g);
                    setSelectedSquare(null);
                    setLegalTargets([]);
                    return next;
                });
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [moveHistory]);

    const copyFen = () => {
        if (!game) return;
        navigator.clipboard.writeText(game.fen());
        setFenCopied(true);
        setTimeout(() => setFenCopied(false), 1500);
    };

    if (!game) return (
        <div className="flex justify-center p-20">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
    );

    const boardState = game.board();
    const ranks = isFlipped ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
    const files = isFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    const evalScore = engineData?.score ?? 0;
    const clampedEval = Math.max(-6, Math.min(6, evalScore));
    const whitePct = 50 + (clampedEval / 6) * 50;

    const renderPiece = (piece: any) => {
        if (!piece) return null;
        const file = `/pieces/classic/${piece.color}${piece.type.toLowerCase()}.png`;
        return (
            <img src={file} alt={`${piece.color}${piece.type}`} draggable={false}
                className="select-none pointer-events-none w-[82%] h-[82%] object-contain"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
        );
    };

    return (
        <div className="flex h-[calc(100vh-53px)] overflow-hidden page-enter bg-page">

            {/* ── EVAL BAR ── */}
            <div className="w-8 shrink-0 mx-3 my-4 flex flex-col rounded-xl overflow-hidden relative hidden lg:flex"
                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                {/* Black section */}
                <div className="transition-all duration-500 shrink-0 flex items-center justify-center"
                    style={{ height: `${100 - whitePct}%`, background: '#1C1C1C', minHeight: 12 }}>
                    {engineData && evalScore < -0.15 && (
                        <span className="text-[9px] font-mono tabular-nums writing-mode-vertical"
                            style={{ color: '#E8DDD0', writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '4px 0' }}>
                            {Math.abs(evalScore).toFixed(1)}
                        </span>
                    )}
                </div>
                {/* White section */}
                <div className="transition-all duration-500 shrink-0 flex items-end justify-center"
                    style={{ height: `${whitePct}%`, background: '#EDE0CC', minHeight: 12 }}>
                    {engineData && evalScore > 0.15 && (
                        <span className="text-[9px] font-mono tabular-nums"
                            style={{ color: '#1C1C1C', writingMode: 'vertical-rl', padding: '4px 0' }}>
                            +{evalScore.toFixed(1)}
                        </span>
                    )}
                </div>
                {/* Labels */}
                <div className="absolute top-2 left-0 right-0 text-center text-[8px] font-semibold pointer-events-none" style={{ color: 'rgba(232,221,204,0.5)' }}>B</div>
                <div className="absolute bottom-2 left-0 right-0 text-center text-[8px] font-semibold pointer-events-none" style={{ color: 'rgba(28,28,28,0.5)' }}>W</div>
            </div>

            {/* ── BOARD COLUMN ── */}
            <div className="flex flex-col items-center justify-center flex-1 min-w-0 py-4 gap-3">
                <div className="relative" style={{
                    width: 'min(calc(100vh - 200px), calc(100vw - 380px), 580px)',
                    aspectRatio: '1'
                }}>
                    <div className="board-outer-frame w-full h-full p-[3px]">
                        <div className="board-inner-frame w-full h-full grid grid-cols-8 grid-rows-8">
                            {ranks.map(rank => files.map(file => {
                                const sq = `${String.fromCharCode(97+file)}${rank+1}`;
                                const piece = boardState[7-rank][file];
                                const isLight = (file+rank)%2===1;
                                const isSelected = selectedSquare === sq;
                                const isTarget = legalTargets.includes(sq);
                                const isLastFrom = moveHistory[currentMoveIndex]?.from === sq;
                                const isLastTo = moveHistory[currentMoveIndex]?.to === sq;
                                let bg = isLight ? '#F0D9B5' : '#B58863';
                                if (isSelected) bg = 'rgba(246,246,105,0.6)';
                                else if (isLastFrom || isLastTo) bg = isLight ? 'rgba(205,163,80,0.55)' : 'rgba(196,150,70,0.55)';
                                return (
                                    <div key={sq} onClick={() => handleSquareClick(sq)}
                                        className="relative flex items-center justify-center cursor-pointer"
                                        style={{ background: bg }}>
                                        {file === (isFlipped ? 7 : 0) && (
                                            <span className="absolute top-0.5 left-0.5 text-[9px] font-semibold pointer-events-none z-10 select-none"
                                                style={{ color: isLight ? '#B58863' : '#F0D9B5', opacity: 0.8 }}>{rank+1}</span>
                                        )}
                                        {rank === (isFlipped ? 7 : 0) && (
                                            <span className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold pointer-events-none z-10 select-none"
                                                style={{ color: isLight ? '#B58863' : '#F0D9B5', opacity: 0.8 }}>{String.fromCharCode(97+file)}</span>
                                        )}
                                        {isTarget && !piece && <div className="w-[28%] h-[28%] rounded-full pointer-events-none" style={{ background: 'rgba(0,0,0,0.18)' }} />}
                                        {isTarget && piece && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.22)' }} />}
                                        {piece && renderPiece(piece)}
                                    </div>
                                );
                            }))}
                        </div>
                    </div>
                </div>

                {/* Navigation controls */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-xl p-1 gap-0.5"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                        {[
                            { icon: <SkipBack size={15} strokeWidth={1.5} />, action: () => navigateToMove(-1), title: 'First' },
                            { icon: <ChevronLeft size={15} strokeWidth={1.5} />, action: () => navigateToMove(Math.max(-1, currentMoveIndex - 1)), title: 'Previous' },
                            { icon: <ChevronRight size={15} strokeWidth={1.5} />, action: () => navigateToMove(Math.min(moveHistory.length - 1, currentMoveIndex + 1)), title: 'Next' },
                            { icon: <SkipForward size={15} strokeWidth={1.5} />, action: () => navigateToMove(moveHistory.length - 1), title: 'Last' },
                        ].map((b, i) => (
                            <button key={i} onClick={b.action} title={b.title}
                                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-hover"
                                style={{ color: 'var(--text-secondary)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
                                {b.icon}
                            </button>
                        ))}
                    </div>

                    {moveHistory.length > 0 && (
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', minWidth: 70 }}>
                            {currentMoveIndex < 0 ? 'Start' : `Move ${currentMoveIndex + 1} / ${moveHistory.length}`}
                        </span>
                    )}

                    <button onClick={() => setIsFlipped(v => !v)} title="Flip board"
                        className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-hover"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
                        <FlipHorizontal2 size={15} strokeWidth={1.5} />
                    </button>

                    <button onClick={() => { setGame(new Chess()); setMoveHistory([]); setCurrentMoveIndex(-1); setSelectedSquare(null); setLegalTargets([]); setEngineData(null); }}
                        title="Reset board"
                        className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-hover"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
                        <RotateCcw size={14} strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="w-[300px] shrink-0 flex flex-col my-4 mr-4 rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>

                {/* Tab bar */}
                <div className="flex shrink-0" style={{ background: 'var(--bg-elevated)', borderBottom: '0.5px solid var(--border)' }}>
                    {(['analysis', 'import'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className="flex-1 h-10 text-sm transition-colors"
                            style={{
                                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                                fontWeight: activeTab === tab ? 500 : 400,
                            }}>
                            {tab === 'analysis' ? 'Analysis' : 'Import'}
                        </button>
                    ))}
                </div>

                {/* ANALYSIS TAB */}
                {activeTab === 'analysis' && (
                    <div className="flex flex-col flex-1 min-h-0">

                        {/* Engine section */}
                        <div className="shrink-0 p-3 space-y-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BarChart2 size={14} className="text-accent" strokeWidth={1.5} />
                                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Stockfish 16</span>
                                    {engineEnabled && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                            style={{ color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                                            d18
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setEngineEnabled(v => !v)}
                                    className="w-9 h-5 rounded-full relative transition-colors"
                                    style={{ background: engineEnabled ? 'var(--accent)' : 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                                        style={{ left: engineEnabled ? 'calc(100% - 18px)' : '2px' }} />
                                </button>
                            </div>

                            {engineEnabled && (
                                engineData ? (
                                    <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: `0.5px solid var(--border)`, borderLeft: `2px solid ${engineData.score > 0.2 ? 'var(--green)' : engineData.score < -0.2 ? 'var(--red)' : 'var(--text-tertiary)'}` }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base font-bold tabular-nums"
                                                    style={{ color: engineData.score > 0.2 ? 'var(--green)' : engineData.score < -0.2 ? 'var(--red)' : 'var(--text-secondary)' }}>
                                                    {engineData.score > 0 ? '+' : ''}{engineData.score?.toFixed(1) ?? '0.0'}
                                                </span>
                                                <span className="text-sm font-medium text-accent">{engineData.best_move}</span>
                                            </div>
                                        </div>
                                        {engineData.pv && (
                                            <div className="flex flex-wrap gap-1">
                                                {engineData.pv.split(' ').slice(0, 8).map((m: string, mi: number) => (
                                                    <span key={mi} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                                        style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>
                                                        {m}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--text-tertiary)' }}>
                                        <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin shrink-0"
                                            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                                        Analyzing position…
                                    </div>
                                )
                            )}

                            {!engineEnabled && (
                                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Enable engine to evaluate the current position.</p>
                            )}
                        </div>

                        {/* Move list — flex-1 scrollable */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {moveHistory.length > 0 ? (
                                <div className="p-2">
                                    {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                                        const wi = i * 2, bi = i * 2 + 1;
                                        return (
                                            <div key={i} className="grid grid-cols-[28px_1fr_1fr] rounded transition-colors hover:bg-hover">
                                                <span className="text-[11px] py-1.5 pl-2 tabular-nums self-center"
                                                    style={{ color: 'var(--text-tertiary)' }}>{i + 1}.</span>
                                                {[wi, bi].map(mi => moveHistory[mi] ? (
                                                    <button key={mi} onClick={() => navigateToMove(mi)}
                                                        className="text-left font-mono text-xs px-2 py-1.5 rounded transition-colors"
                                                        style={{
                                                            color: currentMoveIndex === mi ? 'var(--accent)' : 'var(--text-secondary)',
                                                            background: currentMoveIndex === mi ? 'var(--accent-dim)' : 'transparent',
                                                            fontWeight: currentMoveIndex === mi ? 600 : 400,
                                                        }}>
                                                        {moveHistory[mi].san}
                                                    </button>
                                                ) : <span key={mi} />)}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                                        <ChevronRight size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                                    </div>
                                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Make a move or import a game to see the move list</p>
                                </div>
                            )}
                        </div>

                        {/* FEN footer */}
                        <div className="shrink-0 p-3" style={{ borderTop: '0.5px solid var(--border)', background: 'var(--bg-elevated)' }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>FEN</span>
                                <button onClick={copyFen}
                                    className="flex items-center gap-1 text-[10px] transition-colors"
                                    style={{ color: fenCopied ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                                    {fenCopied ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
                                    {fenCopied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className="font-mono text-[9px] break-all leading-relaxed select-all"
                                style={{ color: 'var(--text-tertiary)' }}>
                                {game.fen()}
                            </div>
                        </div>
                    </div>
                )}

                {/* IMPORT TAB */}
                {activeTab === 'import' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-5">
                        {/* Quick positions */}
                        <div>
                            <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Quick Positions</div>
                            <div className="flex flex-col gap-1.5">
                                {[
                                    { label: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
                                    { label: "King's Gambit", fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2' },
                                    { label: 'Sicilian Defense', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2' },
                                    { label: "Ruy Lopez", fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
                                ].map(pos => (
                                    <button key={pos.label}
                                        onClick={() => { try { const g = new Chess(); g.load(pos.fen); setGame(g); setMoveHistory([]); setCurrentMoveIndex(-1); setActiveTab('analysis'); } catch {} }}
                                        className="text-left px-3 py-2 rounded-lg text-sm transition-colors"
                                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
                                        {pos.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* FEN input */}
                        <div>
                            <label className="text-[10px] uppercase tracking-wider mb-2 block font-medium" style={{ color: 'var(--text-tertiary)' }}>Load from FEN</label>
                            <textarea value={customFen} onChange={e => setCustomFen(e.target.value)}
                                rows={3} placeholder="Paste FEN string…"
                                className="w-full rounded-lg px-3 py-2 font-mono text-xs resize-none focus:outline-none transition-colors"
                                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-primary)' }}
                                onFocus={e => e.target.style.borderColor = 'var(--border-accent)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                            <button
                                onClick={() => { try { const g = new Chess(); g.load(customFen.trim()); setGame(g); setMoveHistory([]); setCurrentMoveIndex(-1); setCustomFen(''); setActiveTab('analysis'); } catch { alert('Invalid FEN'); } }}
                                className="w-full mt-2 py-2 rounded-lg text-sm font-medium transition-colors btn-press"
                                style={{ background: 'var(--accent)', color: '#0F0D0B' }}>
                                Load Position
                            </button>
                        </div>

                        {/* PGN input */}
                        <div>
                            <label className="text-[10px] uppercase tracking-wider mb-2 block font-medium" style={{ color: 'var(--text-tertiary)' }}>Import Game (PGN)</label>
                            <textarea value={customPgn} onChange={e => setCustomPgn(e.target.value)}
                                rows={7} placeholder="Paste PGN…"
                                className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none transition-colors font-mono"
                                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-primary)' }}
                                onFocus={e => e.target.style.borderColor = 'var(--border-accent)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                            <button
                                onClick={() => {
                                    try {
                                        const g = new Chess();
                                        g.loadPgn(customPgn.trim());
                                        const hist = g.history({ verbose: true });
                                        setMoveHistory(hist);
                                        setCurrentMoveIndex(hist.length - 1);
                                        setGame(g);
                                        setCustomPgn('');
                                        setActiveTab('analysis');
                                    } catch { alert('Invalid PGN'); }
                                }}
                                className="w-full mt-2 py-2 rounded-lg text-sm font-medium btn-press transition-colors"
                                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}>
                                Import Game
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
