import { Check, Loader2, MapPin } from 'lucide-react';
import type { ProfileSettingsForm } from '../hooks/useProfileSettings';
import type { SettingsProfile } from '../types';
import { AvatarEditor } from './AvatarEditor';

const LABEL_CLASS = 'block text-sm font-medium text-text-secondary mb-1.5';
const TEXT_INPUT_CLASS =
    'w-full h-11 bg-elevated border border-border-strong rounded-lg px-4 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors';

function SaveButton({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
    return (
        <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface font-medium rounded-lg transition-colors"
        >
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
    );
}

interface ProfileSectionProps {
    profile: SettingsProfile;
    form: ProfileSettingsForm;
    onCancel: () => void;
}

/** "Public Profile" card: avatar, display name, bio, country and save/cancel. */
export function ProfileSection({ profile, form, onCancel }: ProfileSectionProps) {
    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-elevated">
                <h2 className="text-lg font-medium text-text-primary">Public Profile</h2>
                <p className="text-text-tertiary text-sm mt-0.5">Visible to everyone on your profile page.</p>
            </div>

            <div className="p-6 space-y-6">
                {/* Avatar */}
                <AvatarEditor profile={profile} form={form} />

                {/* Display Name */}
                <div>
                    <label className={LABEL_CLASS}>Display Name</label>
                    <input
                        type="text"
                        value={form.displayName}
                        onChange={(e) => form.setDisplayName(e.target.value)}
                        placeholder={profile.username}
                        maxLength={30}
                        className={TEXT_INPUT_CLASS}
                    />
                    <p className="text-text-tertiary text-xs mt-1">
                        Shown in games and on your profile. Leave blank to use username.
                    </p>
                </div>

                {/* Bio */}
                <div>
                    <label className={LABEL_CLASS}>Bio</label>
                    <textarea
                        value={form.bio}
                        onChange={(e) => form.setBio(e.target.value)}
                        placeholder="Tell other players about yourself..."
                        maxLength={160}
                        rows={4}
                        className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                    <div className="flex justify-end mt-1">
                        <span className="text-text-tertiary text-xs">{form.bio.length}/160</span>
                    </div>
                </div>

                {/* Country */}
                <div>
                    <label className={LABEL_CLASS}>
                        <MapPin size={13} className="inline mr-1" strokeWidth={1.5} />
                        Country
                    </label>
                    <input
                        type="text"
                        value={form.country}
                        onChange={(e) => form.setCountry(e.target.value)}
                        placeholder="e.g. India"
                        maxLength={60}
                        className={TEXT_INPUT_CLASS}
                    />
                </div>

                {form.error && (
                    <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        {form.error}
                    </div>
                )}

                <div className="flex items-center gap-3 pt-2 border-t border-border">
                    <SaveButton saving={form.saving} saved={form.saved} onSave={form.handleSave} />
                    <button
                        onClick={onCancel}
                        className="px-4 py-2.5 text-text-secondary hover:text-text-primary text-sm transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
