/** @jest-environment node */
import { PARITY_PAGES } from '@/e2e/parity/config/pages'
import { appMaskSelector } from '@/e2e/parity/config/types'

describe('parity page list', () => {
    it('covers every page the redesign brief names', () => {
        const ids = PARITY_PAGES.map((p) => p.id)
        expect(ids).toEqual(
            expect.arrayContaining(['home-signed-out', 'home-signed-in', 'signin', 'signup', 'lobby', 'game', 'leaderboard', 'analysis', 'profile', 'settings']),
        )
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('has unique states per page, each tab of profile and settings, and a mockup file', () => {
        for (const page of PARITY_PAGES) {
            const states = page.scenarios.map((s) => s.id)
            expect(new Set(states).size).toBe(states.length)
            expect(page.mockupFile).toMatch(/^[A-Z][a-z]+\.dc\.html$/)
        }
        const states = (id: string) => PARITY_PAGES.find((p) => p.id === id)?.scenarios.map((s) => s.id)
        expect(states('profile')).toEqual(['overview', 'games', 'stats', 'friends'])
        expect(states('settings')).toEqual(['public-profile', 'board', 'gameplay', 'notifications', 'privacy', 'account'])
    })

    it('only signed-out pages run without the test project; the game uses the live fixture', () => {
        for (const page of PARITY_PAGES) {
            if (page.id.startsWith('signin') || page.id.startsWith('signup') || page.id === 'home-signed-out') expect(page.role).toBe('anon')
            else expect(page.role).not.toBe('anon')
        }
        expect(PARITY_PAGES.find((p) => p.id === 'game')?.route).toBeNull()
    })

    it('every mask has a selector on both sides', () => {
        for (const page of PARITY_PAGES) {
            for (const mask of [...page.masks, ...page.scenarios.flatMap((s) => s.masks ?? [])]) {
                expect(mask.mockup).not.toBe('')
                expect(appMaskSelector(mask)).not.toBe('')
            }
        }
        expect(appMaskSelector({ key: 'k', mockup: 'x' })).toBe('[data-parity-mask="k"]')
    })
})
