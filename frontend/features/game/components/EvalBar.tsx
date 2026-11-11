// Static evaluation bar (no live engine eval on this page; fixed at 50%).
const EVAL_PCT = 50;

const labelStyle = { fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' } as const;

export default function EvalBar() {
    return (
        <div
            className="hidden lg:flex w-5 flex-col rounded-lg overflow-hidden relative"
            style={{
                height: 'min(80vh, 800px)',
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border)',
            }}
        >
            <div className="absolute top-1.5 w-full text-center z-10" style={labelStyle}>
                W
            </div>
            <div className="absolute bottom-1.5 w-full text-center z-10" style={labelStyle}>
                B
            </div>
            <div
                className="absolute top-0 w-full transition-all duration-500"
                style={{ height: `${100 - EVAL_PCT}%`, background: '#2C2C2C' }}
            />
            <div
                className="absolute bottom-0 w-full transition-all duration-500"
                style={{ height: `${EVAL_PCT}%`, background: '#E8DDD0' }}
            />
        </div>
    );
}
