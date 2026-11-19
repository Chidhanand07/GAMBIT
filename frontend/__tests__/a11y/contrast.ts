/**
 * A4: WCAG 2.x contrast of the design tokens (app/globals.css). Pure helpers for
 * contrast.test.ts; jsdom cannot measure rendered colours, so the token pairs the mockups use
 * for text and for control outlines are checked here instead.
 */
import fs from 'node:fs'
import path from 'node:path'

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

/** `--color-<name>` → hex, from the stylesheet. */
export function token(name: string): string {
    const m = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`))
    if (!m) throw new Error(`no hex token --color-${name}`)
    return m[1]
}

function channel(c: number): number {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contrast ratio of two hex colours (1–21). */
export function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
