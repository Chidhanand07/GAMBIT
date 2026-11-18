import { SIGN_IN_EMAIL_ROW } from '../accountRows';
import type { SettingsPageState } from '../hooks/useSettingsPage';
import type { SettingsProfile } from '../types';
import { EmailField } from './EmailField';
import { SaveBar } from './SettingsCard';
import { Switch } from '@/components/ui/Switch';
import { AccountSettingRow, RowShell } from './SettingRow';
import { TwoFactorDialog } from './TwoFactorDialog';
import { FIELD, READONLY_INPUT } from './styles';

const DEFAULT_RATING = 1200;

const RATINGS = [
    { label: 'Bullet', field: 'rating_bullet' },
    { label: 'Blitz', field: 'rating_blitz' },
    { label: 'Rapid', field: 'rating_rapid' },
    { label: 'Classical', field: 'rating_classical' },
] as const;

function Ratings({ profile }: { profile: SettingsProfile }) {
    return (
        <div className="flex flex-col gap-[10px] px-7 pb-[18px]">
            <span className="font-semibold">Ratings</span>
            {RATINGS.map((r) => (
                <div
                    key={r.label}
                    className="flex min-h-[48px] items-center justify-between rounded-14 border-1 border-line bg-bg-base px-[18px]"
                >
                    <span className="text-ink-muted">{r.label}</span>
                    <span className="font-mono font-bold text-accent">
                        {Math.round(profile[r.field] ?? DEFAULT_RATING)}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Username, email, the four ratings (rounded, 1200 when missing), the account switches and Save. */
export function AccountSection({ profile, state }: { profile: SettingsProfile; state: SettingsPageState }) {
    const { accountDraft, account } = state;
    return (
        <>
            <label className={`${FIELD} pt-2`}>
                <span className="font-semibold">Username</span>
                <input type="text" value={profile.username} readOnly className={READONLY_INPUT} />
            </label>
            <EmailField email={account.emailChange} link={account.emailLink} />
            <Ratings profile={profile} />
            <div>
                <RowShell label="Two-factor authentication" hint="Ask for a code when you sign in.">
                    <Switch
                        label="Two-factor authentication"
                        checked={account.twoFactor.enabled}
                        disabled={!account.twoFactor.known}
                        onChange={account.twoFactor.toggle}
                    />
                </RowShell>
                <AccountSettingRow row={SIGN_IN_EMAIL_ROW} prefs={accountDraft.draft} onChange={state.setAccountPref} />
            </div>
            <TwoFactorDialog tf={account.twoFactor} />
            <SaveBar
                onSave={() => void account.save()}
                onReset={state.resetAll}
                saving={accountDraft.saving}
                status={accountDraft.status}
                error={accountDraft.error}
            />
        </>
    );
}
