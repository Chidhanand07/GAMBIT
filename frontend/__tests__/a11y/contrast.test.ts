/**
 * A4: WCAG AA contrast of the token pairs the screens use. Text needs 4.5:1, control outlines
 * and the focus ring 3:1 (WCAG 1.4.3, 1.4.11). Pairs the mockups themselves failed were
 * adjusted; F-106 lists them.
 */
import { contrast, token } from './contrast'

const AA_TEXT = 4.5
const AA_NON_TEXT = 3

const SURFACES = ['bg-base', 'surface', 'surface-header', 'surface-raised', 'surface-inset']

/** [foreground, background] for body text, labels and links. */
const TEXT_PAIRS: [string, string][] = [
    ...SURFACES.flatMap((bg): [string, string][] => [['ink', bg], ['ink-muted', bg], ['accent', bg]]),
    ['ink-faint', 'bg-base'],
    ['ink-faint', 'surface'],
    ['ink-faint', 'surface-header'],
    ['ink-placeholder', 'bg-base'],
    ['ink-placeholder', 'surface-header'],
    ['on-accent', 'accent'],
    ['on-accent', 'danger'],
    ['on-accent', 'ink'],
    ['success-ink', 'success-bg'],
    ['success', 'surface'],
    ['success', 'bg-base'],
    ['danger', 'surface'],
    ['danger', 'bg-base'],
    ['danger', 'danger-bg'],
    ['danger', 'danger-zone-bg'],
    // board coordinates (F-106): dark ink on every square, cream on walnut's dark squares
    ...['board-light', 'board-dark', 'board-green-light', 'board-green-dark', 'board-slate-light', 'board-slate-dark', 'board-walnut-light'].map(
        (bg): [string, string] => ['on-accent', bg],
    ),
    ['ink', 'board-walnut-dark'],
]

/** [outline, background] for the focus ring and field / switch borders. */
const NON_TEXT_PAIRS: [string, string][] = [
    ...SURFACES.map((bg): [string, string] => ['accent', bg]),
    ['line-field', 'bg-base'],
    ['line-muted', 'bg-base'],
    ['line-muted', 'surface'],
]

describe('token contrast (WCAG AA)', () => {
    test.each(TEXT_PAIRS)('text %s on %s ≥ 4.5:1', (fg, bg) => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_TEXT)
    })
    test.each(NON_TEXT_PAIRS)('outline %s on %s ≥ 3:1', (fg, bg) => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT)
    })
    test('the formula: black on white is 21:1, a colour on itself 1:1', () => {
        expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
        expect(contrast('#183026', '#183026')).toBe(1)
    })
})
