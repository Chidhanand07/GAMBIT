import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { TwoFactorState } from '../hooks/useTwoFactor';
import { INPUT } from './styles';

/** Rendered size of the QR code (px). */
const QR_SIZE = 176;
/** Lucide "shield-check". */
const SHIELD =
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4';

function Enrollment({ tf }: { tf: TwoFactorState }) {
    if (!tf.enrollment) return tf.busy ? <span className="text-[14px] text-ink-muted">Preparing…</span> : null;
    return (
        <div className="flex w-full flex-col items-center gap-3">
            {/* An SVG data URL from Supabase Auth: nothing to optimise or fetch. */}
            <Image
                src={tf.enrollment.qrCode}
                alt="QR code for your authenticator app"
                width={QR_SIZE}
                height={QR_SIZE}
                unoptimized
                className="rounded-12 bg-ink p-2"
            />
            <span className="text-[13px] text-ink-muted">Can&apos;t scan it? Enter this key instead:</span>
            <code className="break-all rounded-12 border-1 border-line bg-bg-base px-3 py-2 font-mono text-[14px] font-bold">
                {tf.enrollment.secret}
            </code>
        </div>
    );
}

const COPY = {
    enable: {
        title: 'Turn on two-factor',
        description: 'Scan the code with an authenticator app, then enter the 6-digit code it shows.',
        action: 'Turn on',
        tone: 'accent',
        variant: 'primary-flat',
    },
    disable: {
        title: 'Turn off two-factor',
        description: 'Enter the 6-digit code from your authenticator app to turn two-factor off.',
        action: 'Turn off',
        tone: 'danger',
        variant: 'danger-solid',
    },
} as const;

/** Settings → Account → Two-factor authentication: enrol (QR + key + code) or turn off (code). */
export function TwoFactorDialog({ tf }: { tf: TwoFactorState }) {
    const enabling = tf.step === 'enable';
    const copy = COPY[tf.step ?? 'disable'];
    const waiting = tf.busy || tf.code.length === 0 || (enabling && !tf.enrollment);
    return (
        <Dialog
            open={tf.step !== null}
            onClose={tf.close}
            title={copy.title}
            description={copy.description}
            iconPath={SHIELD}
            tone={copy.tone}
        >
            {enabling && <Enrollment tf={tf} />}
            <label className="flex flex-col gap-2 text-left">
                <span className="font-semibold">Authentication code</span>
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={tf.code}
                    onChange={(e) => tf.setCode(e.target.value)}
                    className={`${INPUT} min-h-[48px] text-center font-mono tracking-[0.3em]`}
                />
            </label>
            {tf.error && (
                <span role="alert" className="text-[14px] font-semibold text-danger">
                    {tf.error}
                </span>
            )}
            <Button variant={copy.variant} size="lg" onClick={tf.confirm} disabled={waiting}>
                {copy.action}
            </Button>
            <Button variant="ghost" size="lg" onClick={tf.close}>
                Cancel
            </Button>
        </Dialog>
    );
}
