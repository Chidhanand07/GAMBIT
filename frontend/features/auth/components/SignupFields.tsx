import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { UsernameStatus } from '../hooks/useUsernameAvailability';
import { AuthField, ShowPasswordToggle } from './AuthField';

export interface SignupFieldValues {
    email: string;
    username: string;
    password: string;
    confirm: string;
}

interface SignupFieldsProps {
    values: SignupFieldValues;
    onChange: (field: keyof SignupFieldValues, value: string) => void;
    disabled: boolean;
    usernameStatus: UsernameStatus;
    confirmMismatch: boolean;
}

const STATUS_LABEL: Record<UsernameStatus, string> = {
    idle: '',
    checking: 'Checking username',
    available: 'Username available',
    taken: 'Username taken',
};

/** Live availability of the username, inside the field on the right. */
function UsernameStatusIcon({ status }: { status: UsernameStatus }) {
    if (status === 'idle') return null;
    return (
        <span
            role="status"
            aria-label={STATUS_LABEL[status]}
            data-username-status={status}
            className="absolute right-4 top-1/2 flex -translate-y-1/2"
        >
            {status === 'checking' && (
                <Loader2 aria-hidden="true" size={16} className="text-ink-muted motion-safe:animate-spin" />
            )}
            {status === 'available' && (
                <Check aria-hidden="true" size={16} strokeWidth={2.5} className="text-success" />
            )}
            {status === 'taken' && <X aria-hidden="true" size={16} strokeWidth={2.5} className="text-danger" />}
        </span>
    );
}

/** Email, username (with live availability), password and confirm fields (Signup.dc.html). */
export function SignupFields({ values, onChange, disabled, usernameStatus, confirmMismatch }: SignupFieldsProps) {
    // One Show/Hide state for both password fields, as in the mockup.
    const [shown, setShown] = useState(false);
    const toggle = <ShowPasswordToggle shown={shown} onToggle={() => setShown((s) => !s)} />;
    const common = { required: true, disabled };
    return (
        <>
            <AuthField
                id="email"
                name="email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={values.email}
                onChange={(e) => onChange('email', e.target.value)}
                {...common}
            />
            <AuthField
                id="username"
                name="username"
                label="Username"
                hint="Letters, numbers, underscores"
                type="text"
                placeholder="maverick_1"
                autoComplete="username"
                maxLength={20}
                value={values.username}
                onChange={(e) => onChange('username', e.target.value)}
                trailing={<UsernameStatusIcon status={usernameStatus} />}
                invalid={usernameStatus === 'taken'}
                {...common}
            />
            <AuthField
                id="password"
                name="password"
                label="Password"
                type={shown ? 'text' : 'password'}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                value={values.password}
                onChange={(e) => onChange('password', e.target.value)}
                trailing={toggle}
                {...common}
            />
            <AuthField
                id="confirm"
                name="confirm"
                label="Confirm password"
                type={shown ? 'text' : 'password'}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={values.confirm}
                onChange={(e) => onChange('confirm', e.target.value)}
                trailing={toggle}
                invalid={confirmMismatch}
                {...common}
            />
        </>
    );
}
