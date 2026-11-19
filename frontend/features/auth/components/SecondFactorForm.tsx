import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { SecondFactorStep } from '../hooks/useSecondFactorStep';
import { AuthAlert, AuthCard } from './AuthCard';
import { AuthField } from './AuthField';

/** Sign-in, second step (ADR F-144): the 6-digit code from the authenticator app. */
export function SecondFactorForm({ step }: { step: SecondFactorStep }) {
    return (
        <AuthCard title="Two-factor sign-in" subtitle="Enter the 6-digit code from your authenticator app">
            {step.error && <AuthAlert>{step.error}</AuthAlert>}
            <form onSubmit={(e) => void step.onVerify(e)} className="flex flex-col gap-4">
                <AuthField
                    id="totp"
                    name="totp"
                    label="Authentication code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={step.code}
                    onChange={(e) => step.onCode(e.target.value)}
                    required
                    disabled={step.loading}
                    autoFocus
                />
                <Button
                    type="submit"
                    variant="primary-flat"
                    size="2xl"
                    className="mt-1 font-bold disabled:opacity-50"
                    disabled={step.loading}
                >
                    {step.loading ? (
                        <>
                            <Loader2 aria-hidden="true" size={20} className="motion-safe:animate-spin" /> Verifying...
                        </>
                    ) : (
                        'Verify'
                    )}
                </Button>
            </form>
        </AuthCard>
    );
}
