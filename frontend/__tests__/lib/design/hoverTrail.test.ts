import { attachHoverTrail } from '@/lib/design/hoverTrail'

/** Root 400×240 (5 columns × 3 rows of 80px cells) at the viewport origin, unscaled. */
function setup({ cell = '80px', width = 400, height = 240 } = {}) {
    const root = document.createElement('div')
    if (cell) root.style.setProperty('--trail-cell', cell)
    Object.defineProperty(root, 'offsetWidth', { configurable: true, get: () => width })
    Object.defineProperty(root, 'offsetHeight', { configurable: true, get: () => height })
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) })
    const grid = document.createElement('div')
    const highlight = document.createElement('span')
    root.append(grid, highlight)
    document.body.appendChild(root)
    return { root, grid, highlight }
}

let frames: FrameRequestCallback[] = []
const flushFrame = () => {
    const run = frames
    frames = []
    run.forEach((f) => f(0))
}

beforeEach(() => {
    frames = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frames.push(cb)
        return frames.length
    })
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    document.body.innerHTML = ''
})
afterEach(() => jest.restoreAllMocks())

const move = (root: HTMLElement, x: number, y: number) =>
    root.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))

describe('attachHoverTrail', () => {
    test('fills the grid with one .tc cell per 80px cell of the root', () => {
        const { root, grid, highlight } = setup()
        attachHoverTrail({ root, grid, highlight })
        expect(grid.querySelectorAll('span.tc')).toHaveLength(15)
    })

    test('moves are throttled to one frame and highlight the cell under the pointer, with its glyph', () => {
        const { root, grid, highlight } = setup()
        attachHoverTrail({ root, grid, highlight })
        move(root, 250, 10) // col 3, row 0 → cell 4 → ♞
        move(root, 260, 20)
        expect(frames).toHaveLength(1)
        flushFrame()
        expect(highlight).toHaveClass('on')
        expect(highlight.style.left).toBe('240px')
        expect(highlight.style.top).toBe('0px')
        expect(highlight.textContent).toBe('♞︎')
    })

    test('leaving a cell leaves a .gtrace behind it that removes itself when its animation ends', () => {
        const { root, grid, highlight } = setup()
        attachHoverTrail({ root, grid, highlight })
        move(root, 10, 10)
        flushFrame()
        expect(root.querySelector('.gtrace')).toBeNull()
        move(root, 90, 10)
        flushFrame()
        const trace = root.querySelector<HTMLElement>('.gtrace')!
        expect(trace).toHaveAttribute('aria-hidden', 'true')
        expect([trace.style.left, trace.style.top]).toEqual(['0px', '0px'])
        expect(highlight.style.left).toBe('80px')
        trace.dispatchEvent(new Event('animationend'))
        expect(root.querySelector('.gtrace')).toBeNull()
    })

    test('staying inside one cell adds no trace; mouseleave hides the highlight', () => {
        const { root, grid, highlight } = setup()
        attachHoverTrail({ root, grid, highlight })
        move(root, 10, 10)
        flushFrame()
        move(root, 70, 70)
        flushFrame()
        expect(root.querySelector('.gtrace')).toBeNull()
        root.dispatchEvent(new MouseEvent('mouseleave'))
        expect(highlight).not.toHaveClass('on')
    })

    test('corrects for a scaled root (the design canvas zooms the page)', () => {
        const { root, grid, highlight } = setup()
        root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) })
        attachHoverTrail({ root, grid, highlight })
        move(root, 50, 50) // 0.5× scale → (100, 100) → col 1, row 1
        flushFrame()
        expect([highlight.style.left, highlight.style.top]).toEqual(['80px', '80px'])
    })

    test('cleanup removes listeners, cells and traces', () => {
        const { root, grid, highlight } = setup()
        const stop = attachHoverTrail({ root, grid, highlight })
        move(root, 10, 10)
        flushFrame()
        move(root, 90, 10)
        flushFrame()
        stop()
        expect(grid.children).toHaveLength(0)
        expect(root.querySelector('.gtrace')).toBeNull()
        expect(highlight).not.toHaveClass('on')
        move(root, 170, 10)
        expect(frames).toHaveLength(0)
    })

    test('without the --trail-cell token it does nothing', () => {
        const { root, grid, highlight } = setup({ cell: '' })
        const stop = attachHoverTrail({ root, grid, highlight })
        expect(grid.children).toHaveLength(0)
        move(root, 10, 10)
        expect(frames).toHaveLength(0)
        stop()
    })
})
