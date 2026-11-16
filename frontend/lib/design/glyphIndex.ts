// Which hover-trail cells show a gold chess glyph (design/HANDOFF.md §4.1).
// Mirrors the `.tc:nth-child(an+b)::after` rules in app/globals.css: same rules, same order.

/** U+FE0E asks for the text (not emoji) presentation of the glyph. */
const TEXT_PRESENTATION = '︎';

interface GlyphRule {
    /** Cell `n` matches when n = step·k + offset for some k ≥ 0. */
    step: number;
    offset: number;
    glyph: string;
}

/** In priority order: a later rule wins over an earlier one. */
export const TRAIL_GLYPH_RULES: readonly GlyphRule[] = [
    { step: 7, offset: 4, glyph: `♞${TEXT_PRESENTATION}` }, // ♞
    { step: 11, offset: 8, glyph: `♝${TEXT_PRESENTATION}` }, // ♝
    { step: 17, offset: 12, glyph: `♜${TEXT_PRESENTATION}` }, // ♜
    { step: 29, offset: 19, glyph: `♛${TEXT_PRESENTATION}` }, // ♛
    { step: 41, offset: 25, glyph: `♚${TEXT_PRESENTATION}` }, // ♚
];

const matches = (n: number, { step, offset }: GlyphRule) => n >= offset && (n - offset) % step === 0;

/** The glyph for 1-based cell `n`, or '' when the cell has none. */
export function glyphForCell(n: number): string {
    let glyph = '';
    for (const rule of TRAIL_GLYPH_RULES) if (matches(n, rule)) glyph = rule.glyph;
    return glyph;
}

/** 1-based index of the cell at (`col`, `row`) in a grid `cols` wide, in DOM (nth-child) order. */
export function cellIndex(col: number, row: number, cols: number): number {
    return row * cols + col + 1;
}

/** The (col, row) under a point given in the trail's own, unscaled coordinates. */
export function cellAt(x: number, y: number, cellSize: number): { col: number; row: number } {
    return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

/** Columns a `repeat(auto-fill, cellSize)` grid gets in `width`; at least one. */
export function columnsFor(width: number, cellSize: number): number {
    return Math.max(1, Math.floor(width / cellSize));
}
