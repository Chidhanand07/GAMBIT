import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
    id: string;
    label: string;
    /** A line under the label ("Letters, numbers, underscores"). */
    hint?: string;
    /** Right of the label (the "Forgot password?" link); puts the label in a row. */
    action?: ReactNode;
    /** Inside the field on the right (Show/Hide toggle, availability icon). */
    trailing?: ReactNode;
    invalid?: boolean;
}

const LABEL = 'text-[14px] font-semibold';

/** A labelled `.fi` input (Signin.dc.html / Signup.dc.html). */
export function AuthField({ id, label, hint, action, trailing, invalid = false, ...input }: AuthFieldProps) {
    const field = (
        <input
            id={id}
            aria-invalid={invalid || undefined}
            className={cn(
                'fi disabled:opacity-50',
                trailing !== undefined && 'pr-[76px]',
                invalid && 'border-danger focus:border-danger',
            )}
            {...input}
        />
    );
    return (
        <div className="flex flex-col gap-[6px]">
            {action !== undefined ? (
                <div className="flex items-center justify-between gap-3">
                    <label htmlFor={id} className={LABEL}>
                        {label}
                    </label>
                    {action}
                </div>
            ) : (
                <label htmlFor={id} className={LABEL}>
                    {label}
                </label>
            )}
            {hint && <span className="text-[13px] text-ink-muted">{hint}</span>}
            {trailing !== undefined ? (
                <div className="relative">
                    {field}
                    {trailing}
                </div>
            ) : (
                field
            )}
        </div>
    );
}

interface ShowPasswordToggleProps {
    shown: boolean;
    onToggle: () => void;
}

/** The "Show"/"Hide" button inside a password field (aria-pressed, as in the mockup). */
export function ShowPasswordToggle({ shown, onToggle }: ShowPasswordToggleProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={shown}
            className="absolute right-1 top-1 min-h-[44px] rounded-10 border-0 bg-transparent px-3 text-[14px] font-semibold text-accent"
        >
            {shown ? 'Hide' : 'Show'}
        </button>
    );
}
