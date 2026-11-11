import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '@/components/Toast'

function Trigger({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
    const { toast } = useToast()
    return <button onClick={() => toast(message, type)}>show</button>
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

test('shows a toast message when triggered', async () => {
    render(<ToastProvider><Trigger message="Saved!" type="success" /></ToastProvider>)
    await user().click(screen.getByText('show'))
    expect(screen.getByText('Saved!')).toBeInTheDocument()
})

test('stacks multiple toasts', async () => {
    render(<ToastProvider><Trigger message="Hello" /></ToastProvider>)
    const u = user()
    await u.click(screen.getByText('show'))
    await u.click(screen.getByText('show'))
    expect(screen.getAllByText('Hello')).toHaveLength(2)
})

test('disappears on its own after 4 seconds', async () => {
    render(<ToastProvider><Trigger message="Bye soon" /></ToastProvider>)
    await user().click(screen.getByText('show'))
    act(() => { jest.advanceTimersByTime(3999) })
    expect(screen.getByText('Bye soon')).toBeInTheDocument()
    act(() => { jest.advanceTimersByTime(1) })
    expect(screen.queryByText('Bye soon')).not.toBeInTheDocument()
})

test('can be dismissed by the user', async () => {
    render(<ToastProvider><Trigger message="Dismiss me" type="error" /></ToastProvider>)
    const u = user()
    await u.click(screen.getByText('show'))
    const close = screen.getAllByRole('button').find(b => b.textContent === '')!
    await u.click(close)
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument()
})

test('useToast outside a provider is a safe no-op', async () => {
    render(<Trigger message="nobody listens" />)
    await user().click(screen.getByText('show'))
    expect(screen.queryByText('nobody listens')).not.toBeInTheDocument()
})
