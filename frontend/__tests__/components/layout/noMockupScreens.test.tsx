/**
 * [A3] Screens with no mockup use the design's components and tokens: the 404 and error pages,
 * route loading skeletons, the toast and the shared Spinner / Skeleton primitives.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import NotFound from '@/app/not-found'
import ErrorPage from '@/app/error'
import { PageSkeleton } from '@/components/layout/PageSkeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))

const ROOT = path.join(__dirname, '..', '..', '..')

test('404: the centred card with a way to the lobby and home', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the lobby' })).toHaveAttribute('href', '/lobby')
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
})

test('error page: retry calls reset; the error itself is neither shown nor logged (S14)', () => {
    const reset = jest.fn()
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorPage error={new Error('secret detail')} reset={reset} />)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText(/secret detail/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
})

test.each(['board', 'list', 'profile', 'tiles', 'card'] as const)('skeleton "%s" is a labelled status of card-surface blocks', (layout) => {
    const { container } = render(<PageSkeleton layout={layout} label="Loading page" />)
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument()
    const blocks = container.querySelectorAll('span[aria-hidden="true"]')
    expect(blocks.length).toBeGreaterThan(1)
    for (const b of blocks) expect(b).toHaveClass('bg-surface', 'motion-safe:animate-pulse')
})

test('every route that loads data has a loading.tsx', () => {
    for (const route of ['lobby', 'leaderboard', 'profile/[username]', 'game/[id]', 'game/[id]/result', 'settings', 'challenge/[username]', 'join/[token]'])
        expect(fs.existsSync(path.join(ROOT, 'app', route, 'loading.tsx'))).toBe(true)
})

test('Spinner and Skeleton move only when motion is allowed', () => {
    render(<><Spinner label="Loading" /><Skeleton className="h-4" /></>)
    const spinner = screen.getByRole('status', { name: 'Loading' })
    expect(spinner).toHaveClass('motion-safe:animate-spin', 'border-t-accent')
    expect(spinner).not.toHaveClass('animate-spin')
})

test('the legacy tokens are gone from the theme and the stylesheet', () => {
    const config = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8')
    const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8')
    for (const token of ["v('bg-page')", "v('bg-elevated')", "v('bg-hover')", "v('text-primary')", "v('accent-hover')", "'0.5px'"])
        expect(config).not.toContain(token)
    for (const variable of ['--bg-page:', '--bg-elevated:', '--accent:', '--text-primary:', '--border-strong:', '.btn-press', '.toast-enter'])
        expect(css).not.toContain(variable)
})
