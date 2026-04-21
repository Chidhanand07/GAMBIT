"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
// import { motion } from 'framer-motion';

const CLASSIFICATION_COLORS = {
    Brilliant: 'bg-cyan-400',
    Great: 'bg-teal-400',
    Best: 'bg-green-500',
    Excellent: 'bg-green-300',
    Good: 'bg-white',
    Inaccuracy: 'bg-yellow-400',
    Mistake: 'bg-orange-500',
    Blunder: 'bg-red-500',
    Miss: 'bg-pink-500'
} as const;

export default function GameResultPage({ params }: { params: { id: string } }) {
    const [loading, setLoading] = useState(true);

    // Mock data that would be streamed in from Supabase Realtime when engine finishes
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 2000);
        return () => clearTimeout(timer);
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
                <div className="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin"></div>
                <h2 className="text-xl text-text-primary">Analysis in progress...</h2>
                <p className="text-text-secondary text-sm">Stockfish Depth 18 calculating accuracy.</p>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column - White Player */}
            <PlayerResultColumn 
                name="GM Hikaru" 
                color="White" 
                elo="2820" 
                eloChange="+12"
                accuracy={95.2}
                arChange="+1.4"
                moves={{
                    Brilliant: 1, Great: 4, Best: 22, Excellent: 5,
                    Good: 2, Inaccuracy: 1, Mistake: 0, Blunder: 0
                }}
            />

            {/* Center Column - Board Replay */}
            <div className="flex flex-col items-center">
                <div className="w-full max-w-[480px] aspect-square board-outer-frame p-2 mb-8">
                    <div className="w-full h-full board-inner-frame bg-board-dark grid grid-cols-8 grid-rows-8">
                        {Array.from({ length: 64 }).map((_, i) => (
                            <div key={i} className={`w-full h-full ${(Math.floor(i / 8) + i % 8) % 2 === 0 ? 'bg-board-light' : 'bg-board-dark'}`}></div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-[480px]">
                    <button className="flex-1 bg-accent hover:bg-accent-hover text-surface py-3 rounded-lg font-medium transition-colors">
                        Rematch
                    </button>
                    <button className="flex-1 bg-surface border border-border hover:border-border-strong text-text-primary py-3 rounded-lg font-medium transition-colors">
                        Share Game
                    </button>
                    <Link href={`/analysis?game=${params.id}`} className="flex-1 bg-surface border border-border hover:border-border-strong text-text-primary py-3 rounded-lg font-medium transition-colors text-center flex items-center justify-center">
                        Analyse Deeper
                    </Link>
                </div>
            </div>

            {/* Right Column - Black Player */}
            <PlayerResultColumn 
                name="GM Magnus" 
                color="Black" 
                elo="2882" 
                eloChange="-12"
                accuracy={89.4}
                arChange="-2.1"
                moves={{
                    Brilliant: 0, Great: 2, Best: 18, Excellent: 8,
                    Good: 4, Inaccuracy: 3, Mistake: 1, Blunder: 0
                }}
            />
            
        </div>
    )
}

function PlayerResultColumn({ name, color, elo, eloChange, accuracy, arChange, moves }: any) {
    return (
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-elevated border-2 border-border mb-4 flex items-center justify-center text-2xl">
                {color === 'White' ? '♔' : '♚'}
            </div>
            <h2 className="text-2xl text-text-primary font-medium">{name}</h2>
            <div className="flex items-center gap-4 mt-2 mb-8">
                <span className="text-text-secondary">Elo: {elo} <span className={eloChange.startsWith('+') ? 'text-indicator-green' : 'text-red-400'}>{eloChange}</span></span>
                <span className="text-text-secondary">AR: {accuracy} <span className={arChange.startsWith('+') ? 'text-indicator-green' : 'text-red-400'}>{arChange}</span></span>
            </div>

            {/* Accuracy Arc Gauge (Simulated with simple CSS for now) */}
            <div className="relative w-48 h-24 overflow-hidden mb-8 flex justify-center">
                <div 
                  className="absolute top-0 w-48 h-48 rounded-full border-[16px] border-elevated border-b-transparent border-r-transparent transform -rotate-45"
                ></div>
                <div 
                  className="absolute top-0 w-48 h-48 rounded-full border-[16px] border-accent border-b-transparent border-r-transparent origin-center transition-transform duration-1000"
                  style={{ transform: `rotate(${-45 + (180 * (accuracy / 100))}deg)` }}
                ></div>
                <div className="absolute bottom-0 text-3xl font-medium text-text-primary">
                    {accuracy.toFixed(1)}%
                </div>
            </div>

            <div className="w-full space-y-2">
                {Object.entries(moves).map(([type, count]: any) => (
                    count > 0 && (
                        <div key={type} className="flex items-center justify-between py-2 border-b border-border/50">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${CLASSIFICATION_COLORS[type as keyof typeof CLASSIFICATION_COLORS]}`}></div>
                                <span className="text-text-secondary text-sm">{type}</span>
                            </div>
                            <span className="text-text-primary font-medium">{count}</span>
                        </div>
                    )
                ))}
            </div>
        </div>
    )
}
