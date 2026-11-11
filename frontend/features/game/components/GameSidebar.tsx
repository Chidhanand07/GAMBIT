'use client';

// Right sidebar: Moves / Engine / Chat tabs and the turn indicator.
import type { ReactNode } from 'react';
import type { SidebarTab } from '../state/gameReducer';

const TABS: readonly SidebarTab[] = ['Moves', 'Engine', 'Chat'];

export interface GameSidebarProps {
    activeTab: SidebarTab;
    onTabSelect: (tab: SidebarTab) => void;
    moves: ReactNode;
    engine: ReactNode;
    chat: ReactNode;
    /** null once the game is over (indicator hidden). */
    turnIndicator: { isWhiteToMove: boolean; label: string } | null;
}

function TurnIndicator({ isWhiteToMove, label }: { isWhiteToMove: boolean; label: string }) {
    return (
        <div className="p-3 border-t border-border shrink-0">
            <div
                className={`text-xs text-center py-1.5 rounded-lg font-medium ${
                    isWhiteToMove ? 'bg-white/10 text-white' : 'bg-black/20 text-text-secondary'
                }`}
            >
                {label}
            </div>
        </div>
    );
}

export default function GameSidebar({ activeTab, onTabSelect, moves, engine, chat, turnIndicator }: GameSidebarProps) {
    return (
        <div
            className="w-full lg:w-72 bg-surface border border-border rounded-xl flex flex-col overflow-hidden"
            style={{ height: 'min(80vh, 800px)' }}
        >
            <div className="flex border-b border-border shrink-0">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => onTabSelect(tab)}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'Moves' && moves}
                {activeTab === 'Engine' && engine}
                {activeTab === 'Chat' && chat}
            </div>

            {turnIndicator && <TurnIndicator {...turnIndicator} />}
        </div>
    );
}
