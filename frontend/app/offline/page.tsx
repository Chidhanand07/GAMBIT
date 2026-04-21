"use client";

import { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Undo2, RotateCcw, Copy, Upload, MonitorOff } from 'lucide-react';

export default function OfflinePage() {
    const [game, setGame] = useState<Chess | null>(null);
    const [fen, setFen] = useState('start');
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [legalMoves, setLegalMoves] = useState<string[]>([]);
    const [customFenInput, setCustomFenInput] = useState('');

    useEffect(() => {
        const savedFen = localStorage.getItem('offline_fen');
        let newGame: Chess;
        try {
            newGame = new Chess(savedFen || undefined);
        } catch {
            newGame = new Chess();
            localStorage.removeItem('offline_fen');
        }
        setGame(newGame);
        setFen(newGame.fen());
        setMoveHistory(newGame.history());
    }, []);

    if (!game) return null;

    const makeMove = (move: any) => {
        try {
            const result = game.move(move);
            setFen(game.fen());
            setMoveHistory(game.history());
            localStorage.setItem('offline_fen', game.fen());
            return result;
        } catch (e) {
            return null;
        }
    };

    const handleSquareClick = (square: string) => {
        if (selectedSquare) {
            if (selectedSquare === square) {
                setSelectedSquare(null);
                setLegalMoves([]);
                return;
            }
            
            const move = makeMove({
                from: selectedSquare,
                to: square,
                promotion: 'q'
            });

            if (move) {
                setSelectedSquare(null);
                setLegalMoves([]);
            } else {
                const piece = game.get(square as any);
                if (piece && piece.color === game.turn()) {
                    setSelectedSquare(square);
                    const moves = game.moves({ square: square as any, verbose: true }).map((m: any) => m.to);
                    setLegalMoves(moves);
                } else {
                    setSelectedSquare(null);
                    setLegalMoves([]);
                }
            }
        } else {
            const piece = game.get(square as any);
            if (piece && piece.color === game.turn()) {
                setSelectedSquare(square);
                const moves = game.moves({ square: square as any, verbose: true }).map((m: any) => m.to);
                setLegalMoves(moves);
            }
        }
    };

    const resetGame = () => {
        game.reset();
        setFen(game.fen());
        setMoveHistory([]);
        localStorage.removeItem('offline_fen');
        setSelectedSquare(null);
        setLegalMoves([]);
    };

    const undoMove = () => {
        game.undo();
        setFen(game.fen());
        setMoveHistory(game.history());
        localStorage.setItem('offline_fen', game.fen());
        setSelectedSquare(null);
        setLegalMoves([]);
    };

    const copyFen = () => {
        navigator.clipboard.writeText(game.fen());
    };

    const loadFen = () => {
        try {
            game.load(customFenInput);
            setFen(game.fen());
            setMoveHistory(game.history());
            localStorage.setItem('offline_fen', game.fen());
            setSelectedSquare(null);
            setLegalMoves([]);
        } catch (e) {
            alert('Invalid FEN format');
        }
    };

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    
    const renderSquare = (file: string, rank: string) => {
        const square = (file + rank) as any;
        const piece = game.get(square);
        const isLight = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isLegalMove = legalMoves.includes(square);
        const isCheck = piece?.type === 'k' && piece?.color === game.turn() && game.inCheck();

        const getPieceEmoji = (type: string, color: string) => {
            const dictionary: any = {
                'pw': '♙', 'nw': '♘', 'bw': '♗', 'rw': '♖', 'qw': '♕', 'kw': '♔',
                'pb': '♟', 'nb': '♞', 'bb': '♝', 'rb': '♜', 'qb': '♛', 'kb': '♚'
            };
            return dictionary[type + color] || '';
        };

        return (
            <div 
                key={square}
                onClick={() => handleSquareClick(square)}
                className={`w-full aspect-square flex items-center justify-center relative cursor-pointer
                    ${isLight ? 'bg-board-light' : 'bg-board-dark'}
                    ${isSelected ? 'bg-amber-300/40' : ''}
                    ${isCheck ? '!bg-red-500/70' : ''}
                `}
            >
                {file === 'a' && <span className="absolute top-1 left-1 text-[10px] font-bold opacity-80 z-10" style={{ color: isLight ? '#739552' : '#EBECD0' }}>{rank}</span>}
                {rank === '1' && <span className="absolute bottom-1 right-1 text-[10px] font-bold opacity-80 z-10" style={{ color: isLight ? '#739552' : '#EBECD0' }}>{file}</span>}
                
                {piece && (
                    <span className="text-[4vw] md:text-[40px] drop-shadow-md z-20 select-none cursor-grab" style={{ color: piece.color === 'w' ? '#FFFFFF' : '#000000', WebkitTextStroke: piece.color === 'w' ? '1.5px #000' : 'none' }}>
                        {getPieceEmoji(piece.type, piece.color)}
                    </span>
                )}
                
                {isLegalMove && (
                    <div className={`absolute z-30 ${piece ? 'w-full h-full border-4 border-black/20 rounded-full' : 'w-1/3 h-1/3 bg-black/20 rounded-full'}`}></div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 text-text-primary mb-12">
            <div className="mb-6 flex items-center gap-3 bg-elevated border border-border p-4 rounded-xl">
                <MonitorOff size={24} className="text-accent" />
                <div>
                    <h1 className="text-xl font-medium">Offline Play</h1>
                    <p className="text-text-secondary text-sm">Practice or analyze positions — no account required.</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                
                <div className="flex-1 max-w-[600px] flex justify-center w-full">
                    <div className="w-full flex justify-center">
                        <div className="w-full max-w-[600px]">
                            <div className="flex items-center justify-between mb-3 bg-surface p-3 rounded-t-xl border border-border-strong px-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-elevated rounded-full flex items-center justify-center border border-border-strong text-[#000000] font-bold text-2xl">♚</div>
                                    <span className="font-medium text-text-primary">Black</span>
                                </div>
                            </div>
                            
                            <div className="w-full relative shadow-[-10px_10px_30px_rgba(0,0,0,0.8)] border-[12px] border-[#2E2B25] rounded-sm">
                                <div className="grid grid-cols-8 grid-rows-8 w-full aspect-square">
                                    {ranks.map(rank => files.map(file => renderSquare(file, rank)) )}
                                </div>
                                {game.isGameOver() && (
                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
                                        <div className="bg-surface border border-border p-6 rounded-xl text-center space-y-4">
                                            <h2 className="text-2xl font-bold text-accent">Game Over</h2>
                                            <p>{game.isCheckmate() ? 'Checkmate!' : game.isStalemate() ? 'Stalemate' : 'Draw'}</p>
                                            <button onClick={resetGame} className="bg-accent text-surface px-6 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors">Play Again</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex items-center justify-between mt-3 bg-surface p-3 rounded-b-xl border border-border-strong px-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-elevated rounded-full flex items-center justify-center border border-border-strong text-[#FFFFFF] font-bold text-2xl" style={{ WebkitTextStroke: '1px #000' }}>♔</div>
                                    <span className="font-medium text-text-primary">White</span>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-6">
                                <button onClick={undoMove} disabled={moveHistory.length === 0} className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary disabled:opacity-50 py-3 rounded-lg transition-colors font-medium">
                                    <Undo2 size={18} strokeWidth={1.5} /> Undo
                                </button>
                                <button onClick={resetGame} className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary py-3 rounded-lg transition-colors font-medium">
                                    <RotateCcw size={18} strokeWidth={1.5} /> Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full lg:w-[320px] flex flex-col gap-6">
                    <div className="bg-surface border border-border rounded-xl flex-1 flex flex-col overflow-hidden max-h-[400px]">
                        <div className="p-4 border-b border-border bg-elevated font-medium text-text-primary">Move Log</div>
                        <div className="p-4 overflow-y-auto space-y-1">
                            {moveHistory.length === 0 ? <p className="text-text-tertiary text-sm italic">No moves played yet.</p> : null}
                            {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                                <div key={i} className="flex gap-4 text-sm font-mono">
                                    <span className="w-6 text-text-tertiary text-right">{i+1}.</span>
                                    <span className="w-16 text-text-primary">{moveHistory[i*2]}</span>
                                    <span className="w-16 text-text-secondary">{moveHistory[i*2+1] || ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                        <h3 className="font-medium text-text-primary">FEN Editor</h3>
                        <div>
                            <input 
                                type="text" 
                                value={customFenInput} 
                                onChange={(e) => setCustomFenInput(e.target.value)} 
                                placeholder="Paste FEN here..."
                                className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent" 
                            />
                            <div className="flex gap-2 mt-2">
                                <button onClick={loadFen} className="flex-1 flex items-center justify-center gap-1 bg-elevated hover:bg-border text-text-secondary hover:text-text-primary text-xs py-1.5 rounded border border-border-strong transition-colors"><Upload size={14}/> Load</button>
                                <button onClick={copyFen} className="flex-1 flex items-center justify-center gap-1 bg-elevated hover:bg-border text-text-secondary hover:text-text-primary text-xs py-1.5 rounded border border-border-strong transition-colors"><Copy size={14}/> Copy Current</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
