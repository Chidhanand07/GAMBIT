// Engine tab placeholder (analysis is only offered after the game).
export default function EnginePanel() {
    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <span className="text-text-primary font-medium text-sm">Stockfish 16.1</span>
                <span className="text-xs bg-elevated px-2 py-1 rounded text-text-secondary border border-border">
                    depth 22
                </span>
            </div>
            <p className="text-text-tertiary text-xs text-center py-6">
                Enable engine analysis after the game finishes.
            </p>
        </div>
    );
}
