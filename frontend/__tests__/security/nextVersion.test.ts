/**
 * NEXT-16 (NX-01, NX-02): the app runs the Next.js 16.4 line, at or above the patch level the
 * fix brief names (16.4.5), with React 19. The request interception file is `proxy.ts`
 * (Next 16 renamed `middleware.ts`), and the Next ESLint plugin matches the framework line.
 */
import fs from 'node:fs'
import path from 'node:path'
import { version as installed } from 'next/package.json'
import { version as reactInstalled } from 'react/package.json'
import pkg from '../../package.json'

const MIN_PATCHED = [16, 4, 5]
const ROOT = path.join(__dirname, '..', '..')

const parse = (v: string) =>
    v
        .replace(/^[^\d]*/, '')
        .split('.')
        .map((n) => Number.parseInt(n, 10))

/** -1 | 0 | 1 like Array#sort comparators. */
function compare(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0)
        if (diff !== 0) return Math.sign(diff)
    }
    return 0
}

test('the installed next is on the 16.4.x line and at least 16.4.5', () => {
    const [major, minor] = parse(installed)
    expect([major, minor]).toEqual([16, 4])
    expect(compare(parse(installed), MIN_PATCHED)).toBeGreaterThanOrEqual(0)
})

test('package.json pins an exact patched version (no range that could resolve lower)', () => {
    const declared = pkg.dependencies.next
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/)
    expect(compare(parse(declared), MIN_PATCHED)).toBeGreaterThanOrEqual(0)
})

test('React 19 is installed, with matching react-dom and types', () => {
    expect(parse(reactInstalled)[0]).toBe(19)
    expect(parse(pkg.dependencies.react)[0]).toBe(19)
    expect(parse(pkg.dependencies['react-dom'])[0]).toBe(19)
    expect(parse(pkg.devDependencies['@types/react'])[0]).toBe(19)
    expect(parse(pkg.devDependencies['@types/react-dom'])[0]).toBe(19)
})

test('the Next ESLint plugin matches the framework line', () => {
    const [major, minor] = parse(pkg.devDependencies['@next/eslint-plugin-next'])
    expect([major, minor]).toEqual([16, 4])
})

test('request interception lives in proxy.ts; middleware.ts is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'proxy.ts'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'middleware.ts'))).toBe(false)
})

test('no user data is cached: no "use cache", unstable_cache or force-static anywhere [NX-11]', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (/\.tsx?$/.test(entry.name)) {
                const text = fs.readFileSync(full, 'utf8')
                if (/['"]use cache['"]|unstable_cache|force-static|export const revalidate/.test(text)) {
                    offenders.push(path.relative(ROOT, full))
                }
            }
        }
    }
    for (const dir of ['app', 'lib', 'features', 'components']) walk(path.join(ROOT, dir))
    expect(offenders).toEqual([])
})
