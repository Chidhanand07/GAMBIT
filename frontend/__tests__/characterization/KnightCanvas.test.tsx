/**
 * Characterization tests (fe-misc, PR 16 track) for the canvas animations
 * components/ui/KnightBackground.tsx. (The KnightIntro canvas intro was replaced by the CSS
 * splash, components/effects/IntroSplash.tsx; its behaviour is pinned in
 * __tests__/components/effects/IntroSplash.test.tsx.)
 *
 * jsdom has no canvas, so a recording 2D context logs every draw call and
 * property write. Math.random, performance.now and requestAnimationFrame are
 * driven by the test, so a run is fully deterministic: the digest of the call
 * log pins the exact pixels-to-be across a refactor.
 */
import { act, fireEvent, render } from '@testing-library/react'
import { createHash } from 'crypto'
import KnightBackground from '@/components/ui/KnightBackground'

type LogEntry = (string | number | boolean | null)[]
let log: LogEntry[] = []
const r = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : (v as string))

function makeContext(canvasTag: string) {
    let lastText: 'fill' | 'stroke' = 'fill'
    const target: Record<string, unknown> = {
        getImageData: (x: number, y: number, w: number, h: number) => {
            log.push([canvasTag, 'getImageData', x, y, w, h])
            const data = new Uint8ClampedArray(w * h * 4)
            const every = lastText === 'fill' ? 5 : 37
            for (let i = 0; i < w * h; i++) data[i * 4 + 3] = i % every === 0 ? 255 : 10
            return { data }
        },
        createRadialGradient: (...args: number[]) => {
            log.push([canvasTag, 'createRadialGradient', ...args.map(r)])
            return { addColorStop: (o: number, c: string) => log.push([canvasTag, 'addColorStop', o, c]) }
        },
        fillText: (...args: unknown[]) => { lastText = 'fill'; log.push([canvasTag, 'fillText', ...args.map(r)]) },
        strokeText: (...args: unknown[]) => { lastText = 'stroke'; log.push([canvasTag, 'strokeText', ...args.map(r)]) },
    }
    return new Proxy(target, {
        get(t, prop: string) {
            if (prop in t) return t[prop]
            return (...args: unknown[]) => { log.push([canvasTag, prop, ...args.map(r)]) }
        },
        set(t, prop: string, value) {
            log.push([canvasTag, `=${prop}`, typeof value === 'object' ? 'gradient' : r(value)])
            return true
        },
    })
}

let now = 0
let rafQueue: Map<number, FrameRequestCallback>
let rafId = 0
let seed = 1
const digest = () => createHash('sha256').update(JSON.stringify(log)).digest('hex').slice(0, 16)

beforeEach(() => {
    log = []
    now = 1000
    seed = 1
    rafQueue = new Map()
    rafId = 0
    jest.spyOn(Math, 'random').mockImplementation(() => {
        seed = (seed * 16807) % 2147483647
        return (seed - 1) / 2147483646
    })
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    ;(window as any).requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => { rafQueue.set(++rafId, cb); return rafId })
    ;(window as any).cancelAnimationFrame = jest.fn((id: number) => { log.push(['cancelAnimationFrame', id]); rafQueue.delete(id) })
    ;(global as any).requestAnimationFrame = window.requestAnimationFrame
    ;(global as any).cancelAnimationFrame = window.cancelAnimationFrame
    let canvases = 0
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        const tag = this.isConnected ? 'main' : `off${++canvases}`
        return makeContext(tag) as unknown as CanvasRenderingContext2D
    } as any)
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
    ;(window as any).matchMedia = jest.fn(() => ({ matches: false }))
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true })
})
afterEach(() => jest.restoreAllMocks())

function frame(advanceMs: number) {
    now += advanceMs
    const pending = [...rafQueue.entries()]
    rafQueue.clear()
    act(() => { pending.forEach(([, cb]) => cb(now)) })
}

describe('KnightBackground', () => {
    test.each(['landing', 'lobby'] as const)('%s mode draws a deterministic frame sequence', mode => {
        const { container, unmount } = render(<KnightBackground mode={mode} />)
        const canvas = container.querySelector('canvas')!
        expect(canvas.getAttribute('style')).toBe('position: fixed; inset: 0; z-index: -1; pointer-events: none; width: 1200px; height: 800px;')
        expect([canvas.width, canvas.height, canvas.style.width, canvas.style.height]).toEqual([2400, 1600, '1200px', '800px'])
        for (let i = 0; i < 5; i++) frame(16)
        ;(window as any).innerWidth = 600
        fireEvent(window, new Event('resize'))
        expect([canvas.width, canvas.style.width]).toEqual([1200, '600px'])
        frame(16)
        unmount()
        expect(rafQueue.size).toBe(0)
        ;(window as any).innerWidth = 300
        fireEvent(window, new Event('resize'))
        expect(canvas.width).toBe(1200) // resize listener removed on unmount
        expect({ entries: log.length, digest: digest() }).toMatchSnapshot()
    })
})
