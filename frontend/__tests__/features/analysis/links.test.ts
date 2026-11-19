import { analysisGameHref } from '@/features/analysis/links'

describe('analysisGameHref [F-162]', () => {
    test('opens the game on the analysis board, id URI-encoded', () => {
        expect(analysisGameHref('g1')).toBe('/analysis?game=g1')
        expect(analysisGameHref('a&b=c/d')).toBe('/analysis?game=a%26b%3Dc%2Fd')
    })
})
