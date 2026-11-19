'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { needsSecondFactor, verifySignInCode } from '@/lib/mfa';
import { createClient } from '@/lib/supabase/client';

/** Digits in a TOTP code. */
const CODE_LENGTH = 6;

/**
 * The sign-in step after the password when two-factor is on (ADR F-144): the session is AAL1
 * until a code from the authenticator app raises it to AAL2. `check()` enters the step when the
 * session needs it; `resume` enters it on load (the app sent the user here with `?mfa=1`).
 */
export function useSecondFactorStep(onDone: () => void, resume: boolean) {
    const [active, setActive] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    /** True (and the step shown) when this session must still enter a code. */
    const check = async (): Promise<boolean> => {
        const needed = await needsSecondFactor(createClient()).catch(() => false);
        setActive(needed);
        return needed;
    };

    useEffect(() => {
        if (!resume) return;
        let current = true;
        void needsSecondFactor(createClient())
            .then((needed) => {
                if (current) setActive(needed);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [resume]);

    const onCode = (value: string) => {
        setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
        setError(null);
    };

    const onVerify = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const result = await verifySignInCode(createClient(), code).catch(() => ({
            ok: false as const,
            message: 'Something went wrong. Please try again.',
        }));
        setLoading(false);
        if (!result.ok) {
            setError(result.message);
            return;
        }
        onDone();
    };

    return { active, code, error, loading, check, onCode, onVerify };
}

export type SecondFactorStep = ReturnType<typeof useSecondFactorStep>;
