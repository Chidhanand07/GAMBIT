/** @jest-environment node */
import { buildReport } from '@/e2e/parity/lib/report'
import type { CaseResult } from '@/e2e/parity/lib/results'

const result = (over: Partial<CaseResult>): CaseResult => ({
    pageId: 'signin',
    pageLabel: 'Signin',
    scenarioId: 'default',
    scenarioLabel: 'Default',
    width: 375,
    status: 'pass',
    percent: 0.1,
    regions: [],
    maskMisses: { app: [], mockup: [] },
    images: { diff: 'parity/signin__default__375.diff.png' },
    sizes: { app: '375x900', mockup: '375x900' },
    ...over,
})

const options = {
    pages: [
        { id: 'signin', label: 'Signin', scenarios: [{ id: 'default', label: 'Default' }] },
        { id: 'lobby', label: 'Lobby (Main)', scenarios: [{ id: 'default', label: 'Default' }] },
    ],
    widths: [375, 768],
    maxDiffPercent: 0.5,
    generatedAt: '2026-11-18T00:00:00.000Z',
    outDir: 'design',
}

describe('PARITY.md', () => {
    const md = buildReport(
        [
            result({}),
            result({
                width: 768,
                status: 'fail',
                percent: 3.4,
                sizes: { app: '768x1200', mockup: '768x1100' },
                regions: [{ x: 0, y: 160, width: 160, height: 160, percent: 42 }],
                images: { diff: 'parity/signin__default__768.diff.png' },
            }),
            result({ pageId: 'lobby', pageLabel: 'Lobby (Main)', status: 'pending', percent: null, reason: 'pending: test project env files', maskMisses: { app: [], mockup: ['text="x"'] } }),
        ],
        options,
    )

    it('has one row per page and state with a cell per width', () => {
        expect(md).toContain('| Page | State | 375 | 768 |')
        expect(md).toContain('| Signin | Default | PASS 0.10% | FAIL 3.40% |')
        expect(md).toContain('| Lobby (Main) | Default | pending | not run |')
    })

    it('lists failures with the diff image, the size mismatch and the worst regions', () => {
        expect(md).toContain('**Signin / Default @ 768px**: 3.40% (app 768x1200 vs mockup 768x1100)')
        expect(md).toContain('`parity/signin__default__768.diff.png`')
        expect(md).toContain('x 0-160, y 160-320 (42.0%)')
    })

    it('reports the target, the counts, mask misses and pending reasons', () => {
        expect(md).toContain('at most 0.5% differing pixels')
        expect(md).toContain('Cases: 3 - pass 1, fail 1, error 0, pending 1.')
        expect(md).toContain('mockup `text="x"`')
        expect(md).toContain('- pending: test project env files')
    })
})
