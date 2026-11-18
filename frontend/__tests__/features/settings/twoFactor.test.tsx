// TWO-FACTOR (ADR F-144): lib/mfa against a fake Supabase MFA API, and the Account card's
// "Two-factor authentication" switch with its enrol / turn-off dialog.
import { act, fireEvent, render, screen, within } from '@testing-library/react'

type Factor = { id: string; factor_type: string; status: 'verified' | 'unverified' }

function fakeMfa() {
    const state = { factors: [] as Factor[], aal: 'aal1' as 'aal1' | 'aal2', goodCode: '123456', nextId: 1 }
    const verified = () => state.factors.filter((f) => f.status === 'verified')
    const mfa = {
        listFactors: jest.fn(async () => ({ data: { all: state.factors, totp: verified() }, error: null })),
        getAuthenticatorAssuranceLevel: jest.fn(async () => ({
            data: { currentLevel: state.aal, nextLevel: verified().length ? 'aal2' : state.aal },
            error: null,
        })),
        enroll: jest.fn(async () => {
            const id = `f${state.nextId++}`
            state.factors.push({ id, factor_type: 'totp', status: 'unverified' })
            return { data: { id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' } }, error: null }
        }),
        challengeAndVerify: jest.fn(async ({ factorId, code }: { factorId: string; code: string }) => {
            const factor = state.factors.find((f) => f.id === factorId)
            if (!factor || code !== state.goodCode) return { data: null, error: { message: 'Invalid TOTP code entered' } }
            factor.status = 'verified'
            state.aal = 'aal2'
            return { data: {}, error: null }
        }),
        unenroll: jest.fn(async ({ factorId }: { factorId: string }) => {
            const factor = state.factors.find((f) => f.id === factorId)
            if (factor?.status === 'verified' && state.aal !== 'aal2') return { data: null, error: { message: 'AAL2 required' } }
            state.factors = state.factors.filter((f) => f.id !== factorId)
            return { data: { id: factorId }, error: null }
        }),
    }
    const client = {
        auth: {
            mfa,
            refreshSession: jest.fn(async () => {
                state.aal = 'aal1'
                return { data: {}, error: null }
            }),
            getUser: jest.fn(async () => ({ data: { user: { email: 'me@example.com', new_email: null } } })),
        },
    }
    return { state, mfa, client }
}

let fake = fakeMfa()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => fake.client }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
const profile = { id: 'u-1', username: 'me1', display_name: null, bio: '', country: '', avatar_url: null, rating_rapid: 1200, created_at: '2024-01-01' }
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, loading: false, refetch: jest.fn() }) }))

import SettingsPage from '@/app/settings/page'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { disableTwoFactor, isTotpCode, needsSecondFactor, startEnrollment, verifyCode, verifySignInCode } from '@/lib/mfa'
import { settingsStore } from '../../helpers/settingsStore'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

beforeEach(() => {
    fake = fakeMfa()
    ;(global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => [] }))
})

describe('lib/mfa', () => {
    test('a code is six digits; anything else is refused without asking Supabase', async () => {
        expect(isTotpCode(' 123456 ')).toBe(true)
        expect(isTotpCode('12345')).toBe(false)
        expect(await verifyCode(fake.client as any, 'f1', 'abcdef')).toEqual({ ok: false, message: expect.any(String) })
        expect(fake.mfa.challengeAndVerify).not.toHaveBeenCalled()
    })

    test('needsSecondFactor: only an AAL1 session of a user with a verified factor', async () => {
        expect(await needsSecondFactor(fake.client as any)).toBe(false)
        fake.state.factors.push({ id: 'f9', factor_type: 'totp', status: 'verified' })
        expect(await needsSecondFactor(fake.client as any)).toBe(true)
        fake.state.aal = 'aal2'
        expect(await needsSecondFactor(fake.client as any)).toBe(false)
    })

    test('startEnrollment removes an abandoned unverified factor first, then enrols with issuer Gambit', async () => {
        fake.state.factors.push({ id: 'old', factor_type: 'totp', status: 'unverified' })
        const started = await startEnrollment(fake.client as any)
        expect(fake.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
        expect(fake.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'Gambit' })
        expect(started).toEqual({ ok: true, enrollment: { factorId: 'f1', qrCode: expect.stringContaining('data:image/svg+xml'), secret: 'JBSWY3DPEHPK3PXP' } })
    })

    test('disableTwoFactor proves the factor first; a wrong code removes nothing', async () => {
        fake.state.factors.push({ id: 'f9', factor_type: 'totp', status: 'verified' })
        expect((await disableTwoFactor(fake.client as any, 'f9', '000000')).ok).toBe(false)
        expect(fake.mfa.unenroll).not.toHaveBeenCalled()
        expect(await disableTwoFactor(fake.client as any, 'f9', '123456')).toEqual({ ok: true })
        expect(fake.state.factors).toEqual([])
        expect(fake.client.auth.refreshSession).toHaveBeenCalled()
    })

    test('verifySignInCode uses the verified factor; without one it fails', async () => {
        expect((await verifySignInCode(fake.client as any, '123456')).ok).toBe(false)
        fake.state.factors.push({ id: 'f9', factor_type: 'totp', status: 'verified' })
        expect(await verifySignInCode(fake.client as any, '123456')).toEqual({ ok: true })
        expect(fake.mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'f9', code: '123456' })
    })
})

describe('Account → Two-factor authentication', () => {
    async function openAccount() {
        render(<SettingsProvider store={settingsStore()}><SettingsPage /></SettingsProvider>)
        fireEvent.click(within(screen.getByRole('group', { name: 'Settings sections' })).getByRole('button', { name: 'Account' }))
        await flush()
        return screen.getByRole('switch', { name: 'Two-factor authentication' })
    }
    const preview = () => screen.getByRole('complementary', { name: 'Live preview' })

    test('off: the switch shows the real state; turning it on shows the QR code and key, a code turns it on', async () => {
        const toggle = await openAccount()
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        expect(within(preview()).getByText('Two-factor is off')).toBeInTheDocument()
        fireEvent.click(toggle)
        await flush()
        const dialog = screen.getByRole('dialog', { name: 'Turn on two-factor' })
        expect(within(dialog).getByAltText('QR code for your authenticator app')).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'))
        expect(within(dialog).getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
        fireEvent.change(within(dialog).getByPlaceholderText('123456'), { target: { value: '000000' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }))
        await flush()
        expect(within(dialog).getByRole('alert')).toHaveTextContent('That code is not right')
        fireEvent.change(within(dialog).getByPlaceholderText('123456'), { target: { value: '12-34 56' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }))
        await flush()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('switch', { name: 'Two-factor authentication' })).toHaveAttribute('aria-checked', 'true')
        expect(within(preview()).getByText('Two-factor is on')).toBeInTheDocument()
        expect(within(preview()).getByText('6-digit code')).toBeInTheDocument()
    })

    test('cancelling an enrolment deletes the unverified factor', async () => {
        fireEvent.click(await openAccount())
        await flush()
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
        await flush()
        expect(fake.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' })
        expect(fake.state.factors).toEqual([])
    })

    test('on: turning it off needs a code, then the factor is removed', async () => {
        fake.state.factors.push({ id: 'f9', factor_type: 'totp', status: 'verified' })
        const toggle = await openAccount()
        expect(toggle).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(toggle)
        const dialog = screen.getByRole('dialog', { name: 'Turn off two-factor' })
        expect(within(dialog).queryByAltText(/QR code/)).not.toBeInTheDocument()
        fireEvent.change(within(dialog).getByPlaceholderText('123456'), { target: { value: '123456' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }))
        await flush()
        expect(fake.state.factors).toEqual([])
        expect(screen.getByRole('switch', { name: 'Two-factor authentication' })).toHaveAttribute('aria-checked', 'false')
    })
})
