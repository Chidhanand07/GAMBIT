/**
 * NEXT-CVE (NX-01, NX-02): the installed Next.js must carry the fixes for
 * CVE-2025-29927 (middleware authorization bypass, fixed in 14.2.25) and
 * CVE-2025-55184 / CVE-2025-67779 (RSC denial of service, fixed in 14.2.35).
 * This phase stays on the 14.2.x line on purpose (no 15/16 upgrade).
 */
import { version as installed } from 'next/package.json'
import pkg from '../../package.json'

const MIN_PATCHED = [14, 2, 35]

const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10))

/** -1 | 0 | 1 like Array#sort comparators. */
function compare(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0)
        if (diff !== 0) return Math.sign(diff)
    }
    return 0
}

test('the installed next is on the 14.2.x line and at least 14.2.35', () => {
    const [major, minor] = parse(installed)
    expect([major, minor]).toEqual([14, 2])
    expect(compare(parse(installed), MIN_PATCHED)).toBeGreaterThanOrEqual(0)
})

test('package.json pins an exact patched version (no range that could resolve lower)', () => {
    const declared = pkg.dependencies.next
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/)
    expect(compare(parse(declared), MIN_PATCHED)).toBeGreaterThanOrEqual(0)
})

test('the Next ESLint plugin matches the framework line', () => {
    const [major, minor] = parse(pkg.devDependencies['@next/eslint-plugin-next'].replace(/^[^\d]*/, ''))
    expect([major, minor]).toEqual([14, 2])
})
