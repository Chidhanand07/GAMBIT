/**
 * A4: one visible focus indicator (the design's gold ring) for every control, and no motion when
 * the user asks for less. jsdom cannot apply :focus-visible or media queries, so the stylesheet
 * and the class names are checked.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..')
const CSS = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8')

function sources(dir: string): string[] {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) return sources(rel)
        return /\.tsx?$/.test(e.name) ? [rel] : []
    })
}

test('every control gets the focus ring: solid accent outline plus the focus-ring halo', () => {
    const rule = CSS.match(/:where\(([^)]*)\):focus-visible\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    for (const el of ['a', 'button', 'input', 'select', 'textarea', '[tabindex]', '[role="switch"]', '[role="menuitem"]'])
        expect(rule![1]).toContain(el)
    expect(rule![2]).toContain('outline: 2px solid var(--color-accent)')
    expect(rule![2]).toContain('box-shadow: var(--shadow-focus-ring)')
})

test('reduced motion stops every animation and transition', () => {
    const block = CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{([^}]*)\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toContain('animation-duration: 0.01ms !important')
    expect(block![1]).toContain('transition-duration: 0.01ms !important')
})

test('no component spins, pulses or transitions outside motion-safe', () => {
    const offenders = ['app', 'components', 'features']
        .flatMap(sources)
        .filter((file) => /(^|[\s'"`])(animate-(spin|pulse|bounce|ping)|transition-\[)/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')))
    expect(offenders).toEqual([])
})
