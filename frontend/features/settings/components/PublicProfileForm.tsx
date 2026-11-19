import { Tabs } from '@/components/ui/Tabs';
import {
    EXPERIENCE_LABELS,
    EXPERIENCE_LEVELS,
    PLAYING_STYLE_LABELS,
    PLAYING_STYLES,
    PROFILE_TEXT_LIMITS,
    PRONOUNS,
} from '@/lib/profile/fields';
import type { ProfileFieldKey, ProfileSettingsForm } from '../hooks/useProfileSettings';
import type { SettingsProfile } from '../types';
import { ProfileAvatar } from './ProfileAvatar';
import { FIELD, HINT, INPUT } from './styles';

const BIO_MAX = 160;
const DISPLAY_NAME_MAX = 30;
const COUNTRY_MAX = 60;

function AvatarRow({ profile, form }: { profile: SettingsProfile; form: ProfileSettingsForm }) {
    const name = form.values.displayName.trim() || profile.username;
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

interface TextFieldDef {
    key: ProfileFieldKey;
    label: string;
    placeholder: string;
    hint: string;
    max: number;
    type?: 'text' | 'url';
}

/** The text fields of Settings.dc.html's Public profile card, in its order (F-127 adds four). */
function textFields(username: string): TextFieldDef[] {
    return [
        {
            key: 'displayName',
            label: 'Display name',
            placeholder: username,
            hint: 'Shown in games and on your profile. Leave blank to use your username.',
            max: DISPLAY_NAME_MAX,
        },
        { key: 'country', label: 'Country', placeholder: 'e.g. India', hint: '', max: COUNTRY_MAX },
        { key: 'city', label: 'City', placeholder: 'e.g. Bengaluru', hint: '', max: PROFILE_TEXT_LIMITS.city },
        {
            key: 'website',
            label: 'Website or link',
            placeholder: 'https://',
            hint: '',
            max: PROFILE_TEXT_LIMITS.website,
            type: 'url',
        },
        {
            key: 'favoriteOpening',
            label: 'Favorite opening',
            placeholder: "e.g. King's Gambit",
            hint: '',
            max: PROFILE_TEXT_LIMITS.favoriteOpening,
        },
        {
            key: 'favoritePlayer',
            label: 'Favorite player',
            placeholder: 'e.g. Magnus Carlsen',
            hint: '',
            max: PROFILE_TEXT_LIMITS.favoritePlayer,
        },
    ];
}

function TextField({ def, form }: { def: TextFieldDef; form: ProfileSettingsForm }) {
    return (
        <label className={FIELD}>
            <span className="font-semibold">{def.label}</span>
            <input
                type={def.type ?? 'text'}
                value={form.values[def.key]}
                onChange={(e) => form.setField(def.key, e.target.value)}
                placeholder={def.placeholder}
                maxLength={def.max}
                className={`${INPUT} min-h-[48px]`}
            />
            <span className={HINT}>{def.hint}</span>
        </label>
    );
}

interface ChoiceDef {
    key: ProfileFieldKey;
    label: string;
    hint: string;
    options: { id: string; label: string }[];
}

/** The choice rows under the bio (Settings.dc.html): "" is the "not set" option where it has one. */
const CHOICES: readonly ChoiceDef[] = [
    {
        key: 'pronouns',
        label: 'Pronouns',
        hint: 'Shown next to your username.',
        options: [{ id: '', label: 'Prefer not to say' }, ...PRONOUNS.map((p) => ({ id: p, label: p }))],
    },
    {
        key: 'playingStyle',
        label: 'Playing style',
        hint: 'Shown as a chip on your profile.',
        options: [
            { id: '', label: 'Not set' },
            ...PLAYING_STYLES.map((id) => ({ id, label: PLAYING_STYLE_LABELS[id] })),
        ],
    },
    {
        key: 'experience',
        label: 'Experience',
        hint: 'Shown on your profile.',
        options: EXPERIENCE_LEVELS.map((id) => ({ id, label: EXPERIENCE_LABELS[id] })),
    },
];

function ChoiceRow({ def, form }: { def: ChoiceDef; form: ProfileSettingsForm }) {
    return (
        <div className="flex flex-wrap items-center gap-4 border-t-1 border-line-subtle px-7 py-[18px]">
            <span className="flex flex-[1_1_240px] flex-col gap-[2px]">
                <span className="font-semibold">{def.label}</span>
                <span className="text-[14px] text-ink-muted">{def.hint}</span>
            </span>
            <Tabs
                label={def.label}
                tone="accent"
                items={def.options}
                value={form.values[def.key]}
                onChange={(id) => form.setField(def.key, id)}
            />
        </div>
    );
}

function BioField({ form }: { form: ProfileSettingsForm }) {
    return (
        <label className={FIELD}>
            <span className="font-semibold">Bio</span>
            <textarea
                rows={3}
                maxLength={BIO_MAX}
                value={form.values.bio}
                onChange={(e) => form.setField('bio', e.target.value)}
                placeholder="Tell other players about yourself…"
                className={`${INPUT} resize-y py-3 leading-[1.5]`}
            />
            <span className={`${HINT} flex justify-between gap-3`}>
                <span>Up to {BIO_MAX} characters.</span>
                <span>
                    {form.values.bio.length}/{BIO_MAX}
                </span>
            </span>
        </label>
    );
}

/** Avatar, the public-profile text fields, bio and choices: saved with PATCH /api/profile/me. */
export function PublicProfileForm({ profile, form }: { profile: SettingsProfile; form: ProfileSettingsForm }) {
    return (
        <>
            <AvatarRow profile={profile} form={form} />
            {textFields(profile.username).map((def) => (
                <TextField key={def.key} def={def} form={form} />
            ))}
            <BioField form={form} />
            <div>
                {CHOICES.map((def) => (
                    <ChoiceRow key={def.key} def={def} form={form} />
                ))}
            </div>
        </>
    );
}
