import type { ProfileSettingsForm } from '../hooks/useProfileSettings';
import type { SettingsProfile } from '../types';
import { ProfileAvatar } from './ProfileAvatar';
import { FIELD, HINT, INPUT } from './styles';

const BIO_MAX = 160;

function AvatarRow({ profile, form }: { profile: SettingsProfile; form: ProfileSettingsForm }) {
    const name = form.displayName.trim() || profile.username;
    return (
        <div className="flex flex-wrap items-center gap-[18px] px-7 pb-[22px] pt-2">
            <button
                type="button"
                aria-label="Change profile photo"
                title="Change photo"
                onClick={() => form.fileInputRef.current?.click()}
                disabled={form.avatarUploading}
                className="rounded-full border-0 bg-transparent p-0 disabled:opacity-60"
            >
                <ProfileAvatar name={name} src={form.avatarUrl} size={72} />
            </button>
            <input
                ref={form.fileInputRef}
                type="file"
                accept="image/*"
                aria-label="Profile photo"
                tabIndex={-1}
                className="hidden"
                onChange={form.handleAvatarUpload}
            />
            <div className="flex flex-col gap-[2px]">
                <span className="text-[18px] font-semibold">{name}</span>
                <span className="text-[14px] text-ink-muted">@{profile.username}</span>
                {form.avatarUploading && <span className="text-[13px] text-accent">Uploading…</span>}
            </div>
        </div>
    );
}

/** Avatar, display name, country and bio: saved with PATCH /api/profile/me (useProfileSettings). */
export function PublicProfileForm({ profile, form }: { profile: SettingsProfile; form: ProfileSettingsForm }) {
    return (
        <>
            <AvatarRow profile={profile} form={form} />
            <label className={FIELD}>
                <span className="font-semibold">Display name</span>
                <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => form.setDisplayName(e.target.value)}
                    placeholder={profile.username}
                    maxLength={30}
                    className={`${INPUT} min-h-[48px]`}
                />
                <span className={HINT}>Shown in games and on your profile. Leave blank to use your username.</span>
            </label>
            <label className={FIELD}>
                <span className="font-semibold">Country</span>
                <input
                    type="text"
                    value={form.country}
                    onChange={(e) => form.setCountry(e.target.value)}
                    placeholder="e.g. India"
                    maxLength={60}
                    className={`${INPUT} min-h-[48px]`}
                />
                <span className={HINT} />
            </label>
            <label className={FIELD}>
                <span className="font-semibold">Bio</span>
                <textarea
                    rows={3}
                    maxLength={BIO_MAX}
                    value={form.bio}
                    onChange={(e) => form.setBio(e.target.value)}
                    placeholder="Tell other players about yourself…"
                    className={`${INPUT} resize-y py-3 leading-[1.5]`}
                />
                <span className={`${HINT} flex justify-between gap-3`}>
                    <span>Up to {BIO_MAX} characters.</span>
                    <span>
                        {form.bio.length}/{BIO_MAX}
                    </span>
                </span>
            </label>
        </>
    );
}
