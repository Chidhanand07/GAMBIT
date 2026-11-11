/**
 * Characterization tests (fe-misc, PR 16 track) for lib/sounds.ts.
 */
describe('lib/sounds', () => {
    test('each helper rewinds and plays its preloaded clip; end sound always uses checkmate', () => {
        const created: { src: string; preload: string; currentTime: number; play: jest.Mock }[] = []
        const OriginalAudio = (global as any).Audio
        ;(global as any).Audio = jest.fn((src: string) => {
            const a = { src, preload: '', currentTime: 5, play: jest.fn(() => Promise.resolve()) }
            created.push(a)
            return a
        })
        let sounds: any
        jest.isolateModules(() => { sounds = require('@/lib/sounds') })
        ;(global as any).Audio = OriginalAudio
        expect(created.map(a => [a.src, a.preload])).toEqual([
            ['/audio/move-self.mp3', 'auto'], ['/audio/capture.mp3', 'auto'], ['/audio/castle.mp3', 'auto'],
            ['/audio/check.mp3', 'auto'], ['/audio/checkmate.mp3', 'auto'], ['/audio/matchstart.mp3', 'auto'],
            ['/audio/promote.mp3', 'auto'],
        ])
        const bySrc = (s: string) => created.find(a => a.src === s)!
        const cases: [() => void, string][] = [
            [sounds.playMoveSound, '/audio/move-self.mp3'],
            [sounds.playCaptureSound, '/audio/capture.mp3'],
            [sounds.playCastleSound, '/audio/castle.mp3'],
            [sounds.playCheckSound, '/audio/check.mp3'],
            [sounds.playCheckmateSound, '/audio/checkmate.mp3'],
            [sounds.playPromoteSound, '/audio/promote.mp3'],
            [sounds.playGameStartSound, '/audio/matchstart.mp3'],
            [() => sounds.playGameEndSound(true), '/audio/checkmate.mp3'],
            [() => sounds.playGameEndSound(false), '/audio/checkmate.mp3'],
        ]
        for (const [fn, src] of cases) {
            created.forEach(a => { a.play.mockClear(); a.currentTime = 5 })
            fn()
            expect(created.filter(a => a.play.mock.calls.length).map(a => a.src)).toEqual([src])
            expect(bySrc(src).currentTime).toBe(0)
        }
    })

    test('rejected play() and throwing play() are swallowed', async () => {
        const OriginalAudio = (global as any).Audio
        let mode = 'reject'
        ;(global as any).Audio = jest.fn(() => ({
            preload: '', currentTime: 0,
            play: jest.fn(() => { if (mode === 'throw') throw new Error('x'); return Promise.reject(new Error('autoplay')) }),
        }))
        let sounds: any
        jest.isolateModules(() => { sounds = require('@/lib/sounds') })
        ;(global as any).Audio = OriginalAudio
        expect(() => sounds.playMoveSound()).not.toThrow()
        await Promise.resolve()
        mode = 'throw'
        expect(() => sounds.playMoveSound()).not.toThrow()
    })
})
