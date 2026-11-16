import { render } from '@testing-library/react'
import PageBackground from '@/components/layout/PageBackground'

const setReducedMotion = (reduce: boolean) => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: reduce && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }))
}

describe('PageBackground', () => {
    test('renders the page root with the trail behind the content (aria-hidden, before children)', () => {
        setReducedMotion(false)
        const { container, getByText } = render(
            <PageBackground>
                <p>content</p>
            </PageBackground>,
        )
        const root = container.querySelector('.g-page')!
        expect(root.firstElementChild).toHaveClass('g-trail')
        expect(root.firstElementChild).toHaveAttribute('aria-hidden', 'true')
        expect(root.children[1]).toHaveClass('ghl')
        expect(root.children[1]).toHaveAttribute('aria-hidden', 'true')
        expect(getByText('content').parentElement).toBe(root)
    })

    test('the trail starts on mount when the token is present and stops on unmount', () => {
        setReducedMotion(false)
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 160 })
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 160 })
        const style = jest.spyOn(window, 'getComputedStyle').mockImplementation(
            () => ({ getPropertyValue: (name: string) => (name === '--trail-cell' ? '80px' : '') }) as CSSStyleDeclaration,
        )
        // jsdom has no stylesheet: the --trail-cell token is served by the getComputedStyle stub.
        const { container, unmount } = render(<PageBackground>x</PageBackground>)
        const grid = container.querySelector('.g-trail')!
        expect(grid.querySelectorAll('.tc')).toHaveLength(4)
        unmount()
        expect(grid.children).toHaveLength(0)
        style.mockRestore()
        delete (HTMLElement.prototype as any).offsetWidth
        delete (HTMLElement.prototype as any).offsetHeight
    })

    test('reduced motion: no cells, no listeners on the root, even with the token present', () => {
        setReducedMotion(true)
        const style = jest.spyOn(window, 'getComputedStyle').mockImplementation(
            () => ({ getPropertyValue: (name: string) => (name === '--trail-cell' ? '80px' : '') }) as CSSStyleDeclaration,
        )
        const add = jest.spyOn(HTMLElement.prototype, 'addEventListener')
        const { container } = render(<PageBackground>x</PageBackground>)
        const root = container.querySelector('.g-page')
        expect(container.querySelectorAll('.tc')).toHaveLength(0)
        expect(add.mock.contexts.filter((el) => el === root)).toHaveLength(0)
        add.mockRestore()
        style.mockRestore()
    })
})
