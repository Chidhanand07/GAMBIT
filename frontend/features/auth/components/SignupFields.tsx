import { Check, X, Loader2 } from 'lucide-react';
import type { UsernameStatus } from '../hooks/useUsernameAvailability';

const INPUT_CLASS =
    'w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary focus:outline-none focus:border-accent focus:ring-[1.5px] focus:ring-accent/20 disabled:opacity-50 transition-colors';
const CONFIRM_BASE_CLASS =
    'w-full h-[44px] bg-elevated border rounded-lg px-4 text-text-primary focus:outline-none focus:ring-[1.5px] disabled:opacity-50 transition-colors';
const CONFIRM_ERROR_CLASS = 'border-[#C0392B] focus:border-[#C0392B] focus:ring-[#C0392B]/20';
const CONFIRM_OK_CLASS = 'border-border-strong focus:border-accent focus:ring-accent/20';
const LABEL_CLASS = 'block text-text-secondary text-sm mb-1.5';

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

function UsernameStatusIcon({ status }: { status: UsernameStatus }) {
    return (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {status === 'checking' && <Loader2 size={15} className="text-text-tertiary animate-spin" />}
            {status === 'available' && <Check size={15} className="text-indicator-green" strokeWidth={2.5} />}
            {status === 'taken' && <X size={15} className="text-[#C0392B]" strokeWidth={2.5} />}
        </div>
    );
}

/** Email, username (with live availability), password and confirm inputs of the signup form. */
export function SignupFields({ values, onChange, disabled, usernameStatus, confirmMismatch }: SignupFieldsProps) {
    return (
        <>
            <div>
                <label htmlFor="email" className={LABEL_CLASS}>
                    Email
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={values.email}
                    onChange={(e) => onChange('email', e.target.value)}
                    required
                    disabled={disabled}
                    className={INPUT_CLASS}
                />
            </div>

            <div>
                <label htmlFor="username" className={LABEL_CLASS}>
                    Username
                    <span className="text-text-tertiary text-xs ml-2">letters, numbers, underscores</span>
                </label>
                <div className="relative">
                    <input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        value={values.username}
                        onChange={(e) => onChange('username', e.target.value)}
                        required
                        disabled={disabled}
                        maxLength={20}
                        className="w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 pr-10 text-text-primary focus:outline-none focus:border-accent focus:ring-[1.5px] focus:ring-accent/20 disabled:opacity-50 transition-colors"
                    />
                    <UsernameStatusIcon status={usernameStatus} />
                </div>
            </div>

            <div>
                <label htmlFor="password" className={LABEL_CLASS}>
                    Password
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={values.password}
                    onChange={(e) => onChange('password', e.target.value)}
                    required
                    disabled={disabled}
                    minLength={8}
                    className={INPUT_CLASS}
                />
            </div>

            <div>
                <label htmlFor="confirm" className={LABEL_CLASS}>
                    Confirm Password
                </label>
                <input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={values.confirm}
                    onChange={(e) => onChange('confirm', e.target.value)}
                    required
                    disabled={disabled}
                    className={`${CONFIRM_BASE_CLASS} ${confirmMismatch ? CONFIRM_ERROR_CLASS : CONFIRM_OK_CLASS}`}
                />
            </div>
        </>
    );
}
