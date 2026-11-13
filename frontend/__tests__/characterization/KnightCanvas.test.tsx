/**
 * Characterization tests (fe-misc, PR 16 track) for the canvas animations
 * components/ui/KnightBackground.tsx and components/ui/KnightIntro.tsx.
 *
 * jsdom has no canvas, so a recording 2D context logs every draw call and
 * property write. Math.random, performance.now and requestAnimationFrame are
 * driven by the test, so a run is fully deterministic: the digest of the call
 * log pins the exact pixels-to-be across a refactor.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createHash } from 'crypto'
import KnightBackground from '@/components/ui/KnightBackground'
import KnightIntro, { sampleKnightPerimeter, sampleKnightPoints } from '@/components/ui/KnightIntro'

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

describe('KnightIntro', () => {
    test('sampling helpers map silhouette pixels into the destination box', () => {
        const pts = sampleKnightPoints(400, 1200, 800)
        const edge = sampleKnightPerimeter(600, 1200, 800)
        expect(pts).toHaveLength(400)
        expect(edge).toHaveLength(600)
        expect(pts[0]).toEqual({ x: 392, y: 192 })
        expect({ pts: digestOf(pts), edge: digestOf(edge), log: digest() }).toMatchSnapshot()
    })

    test('full 17.5 s timeline: overlay/intro opacity and onComplete', () => {
        const onComplete = jest.fn()
        const { container } = render(<KnightIntro onComplete={onComplete} />)
        const root = container.firstElementChild as HTMLElement
        const title = screen.getByText('GAMBIT').parentElement as HTMLElement
        const opacities: [number, string, string][] = []
        for (let t = 0; t <= 18000; t += 250) {
            frame(t === 0 ? 0 : 250)
            if (t % 1000 === 0) opacities.push([t, root.style.opacity, title.style.opacity])
        }
        expect(onComplete).toHaveBeenCalledTimes(1)
        expect(rafQueue.size).toBe(0)
        expect(opacities).toMatchSnapshot()
        expect({ entries: log.length, digest: digest() }).toMatchSnapshot()
    })

    test('skip button calls onComplete; unmount cancels the frame loop', () => {
        const onComplete = jest.fn()
        const { unmount } = render(<KnightIntro onComplete={onComplete} />)
        frame(16)
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
        expect(onComplete).toHaveBeenCalledTimes(1)
        unmount()
        expect(rafQueue.size).toBe(0)
    })

    test('F17: Skip stops the frame loop at once, and onComplete never fires a second time', () => {
        const onComplete = jest.fn()
        render(<KnightIntro onComplete={onComplete} />)
        frame(16)
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
        expect(rafQueue.size).toBe(0)
        for (let t = 0; t <= 18000; t += 250) frame(250)
        expect(onComplete).toHaveBeenCalledTimes(1)
    })

    // F17 (was: '... completes immediately (and still starts the canvas)', rafQueue.size 1):
    // a completed intro runs no frame loop.
    test.each([
        ['reduced motion', () => { (window as any).matchMedia = jest.fn(() => ({ matches: true })) }],
        ['low-end CPU', () => { Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true }) }],
    ])('%s completes immediately and starts no frame loop', (_name, setup) => {
        setup()
        const onComplete = jest.fn()
        render(<KnightIntro onComplete={onComplete} />)
        expect(onComplete).toHaveBeenCalledTimes(1)
        expect(rafQueue.size).toBe(0)
    })
})

function digestOf(v: unknown) {
    return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)
}
