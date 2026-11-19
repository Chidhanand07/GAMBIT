import { act, fireEvent, render, screen } from '@testing-library/react'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))
const resetPasswordForEmail = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { resetPasswordForEmail } }) }))

import ResetPasswordPage from '@/app/reset-password/page'

const submit = async (email: string) => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
    for (let i = 0; i < 3; i++) await act(async () => {})
}

beforeEach(() => resetPasswordForEmail.mockReset())

test('sends the reset e-mail and shows the confirmation with a link back to login', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ResetPasswordPage />)
    expect(screen.getByText('Cancel').closest('a')).toHaveAttribute('href', '/login')
    await submit('a@b.c')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c')
    expect(screen.getByRole('status')).toHaveTextContent('A password reset link has been sent to your email.')
    expect(screen.queryByRole('button', { name: 'Send Reset Link' })).not.toBeInTheDocument()
    expect(screen.getByText('Back to Login').closest('a')).toHaveAttribute('href', '/login')
})

test('shows the Supabase error and keeps the form', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Rate limit exceeded' } })
    render(<ResetPasswordPage />)
    await submit('a@b.c')
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded')
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled()
})
