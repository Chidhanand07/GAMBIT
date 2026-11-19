import { useCallback, useEffect, useState } from 'react';
import {
    cancelEnrollment,
    disableTwoFactor,
    startEnrollment,
    twoFactorStatus,
    verifyCode,
    type Enrollment,
    type TwoFactorStatus,
} from '@/lib/mfa';
import { createClient } from '@/lib/supabase/client';

export type TwoFactorStep = 'enable' | 'disable' | null;

const LOAD_FAILED = 'Two-factor status could not be loaded.';
/** Digits in a TOTP code. */
const CODE_LENGTH = 6;

function useStatus() {
    const [status, setStatus] = useState<TwoFactorStatus | null>(null);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        let current = true;
        void Promise.resolve()
            .then(() => twoFactorStatus(createClient()))
            .then((next) => {
                if (current) setStatus(next);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [version]);
    const reload = useCallback(() => setVersion((v) => v + 1), []);
    return { status, reload };
}

/**
 * The Account card's "Two-factor authentication" switch (ADR F-144). The switch shows the real
 * state; flipping it opens a dialog: on → scan the QR code (or type the secret) and confirm a
 * code; off → confirm a code, then the factor is removed. Closing an unfinished enrolment
 * deletes the unverified factor.
 */
export function useTwoFactor() {
    const { status, reload } = useStatus();
    const [step, setStep] = useState<TwoFactorStep>(null);
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const begin = async (next: TwoFactorStep) => {
        setStep(next);
        setCode('');
        setError('');
        if (next !== 'enable') return;
        setBusy(true);
        const started = await startEnrollment(createClient()).catch(() => null);
        setBusy(false);
        if (started?.ok) setEnrollment(started.enrollment);
        else setError(started && !started.ok ? started.message : LOAD_FAILED);
    };

    const close = () => {
        if (enrollment) void cancelEnrollment(createClient(), enrollment.factorId).catch(() => {});
        setEnrollment(null);
        setStep(null);
        setError('');
    };

    const confirm = async () => {
        const factorId = step === 'enable' ? enrollment?.factorId : status?.factorId;
        if (!factorId) return;
        setBusy(true);
        const client = createClient();
        const done =
            step === 'enable'
                ? await verifyCode(client, factorId, code)
                : await disableTwoFactor(client, factorId, code);
        setBusy(false);
        if (!done.ok) {
            setError(done.message);
            return;
        }
        setEnrollment(null);
        setStep(null);
        reload();
    };

    return {
        enabled: status?.enabled ?? false,
        known: status !== null,
        step,
        enrollment,
        code,
        setCode: (value: string) => {
            setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
            setError('');
        },
        error,
        busy,
        toggle: (on: boolean) => void begin(on ? 'enable' : 'disable'),
        close,
        confirm: () => void confirm(),
    };
}

export type TwoFactorState = ReturnType<typeof useTwoFactor>;
