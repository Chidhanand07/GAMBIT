import { useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SettingsProfile } from '../types';

const SAVED_BADGE_MS = 2500;
const AVATAR_BUCKET = 'avatars';

function patchMyProfile(body: Record<string, string | null>) {
    return fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/**
 * Uploads `file` as `<profileId>/avatar.<ext>` (upsert) and PATCHes the public URL onto the profile.
 * Returns the storage error message, or the public URL. Other failures throw.
 */
async function uploadAvatarFile(
    profileId: string,
    file: File,
): Promise<{ uploadError: string } | { publicUrl: string }> {
    const supabase = createClient();
    const ext = file.name.split('.').pop();
    const path = `${profileId}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true });
    if (uploadErr) return { uploadError: uploadErr.message };
    const {
        data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // Save to profile
    await patchMyProfile({ avatarUrl: publicUrl });
    return { publicUrl };
}

/** The editable public-profile text and choices; "" is "not set" (F-127). */
export interface ProfileFieldValues {
    displayName: string;
    bio: string;
    country: string;
    city: string;
    website: string;
    favoriteOpening: string;
    favoritePlayer: string;
    pronouns: string;
    playingStyle: string;
    experience: string;
}

export type ProfileFieldKey = keyof ProfileFieldValues;

/** A stored text column as a form value ("" when empty or missing). */
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function valuesOf(p: SettingsProfile): ProfileFieldValues {
    return {
        displayName: text(p.display_name),
        bio: text(p.bio),
        country: text(p.country),
        city: text(p.city),
        website: text(p.website),
        favoriteOpening: text(p.favorite_opening),
        favoritePlayer: text(p.favorite_player),
        pronouns: text(p.pronouns),
        playingStyle: text(p.playing_style),
        experience: text(p.experience),
    };
}

const EMPTY_VALUES = valuesOf({} as SettingsProfile);

/** The PATCH body: every field trimmed, an empty one sent as null (it clears the column). */
export function patchBody(values: ProfileFieldValues): Record<ProfileFieldKey, string | null> {
    const body = {} as Record<ProfileFieldKey, string | null>;
    for (const key of Object.keys(values) as ProfileFieldKey[]) body[key] = values[key].trim() || null;
    return body;
}

/**
 * Editable fields, prefilled when a (different) profile loads. Keyed on the profile id, so a
 * refetch of the same profile does not wipe unsaved edits. The prefill is a state adjustment
 * during render (React's pattern for "reset state when a prop changes"), not an effect.
 */
function useProfileFields(profile: SettingsProfile | null) {
    const [values, setValues] = useState<ProfileFieldValues>(EMPTY_VALUES);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [prefilledFor, setPrefilledFor] = useState<string | undefined>(undefined);

    const fillFrom = (p: SettingsProfile) => {
        setValues(valuesOf(p));
        setAvatarUrl(p.avatar_url || null);
    };

    if (profile && profile.id !== prefilledFor) {
        setPrefilledFor(profile.id);
        fillFrom(profile);
    }

    /** Discards unsaved edits: the fields show the saved profile again. */
    const resetFields = () => {
        if (profile) fillFrom(profile);
    };
    const setField = (key: ProfileFieldKey, value: string) => setValues((v) => ({ ...v, [key]: value }));

    return { values, setField, avatarUrl, setAvatarUrl, resetFields };
}

/** Form state and save/upload handlers of the "Public Profile" settings section. */
export function useProfileSettings(profile: SettingsProfile | null, refetch: () => void) {
    const fields = useProfileFields(profile);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        setAvatarUploading(true);
        try {
            const result = await uploadAvatarFile(profile.id, file);
            if ('uploadError' in result) {
                setError('Upload failed: ' + result.uploadError);
                return;
            }
            fields.setAvatarUrl(result.publicUrl + '?t=' + Date.now());
            refetch();
        } catch {
            setError('Upload failed — try again');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        setError('');
        try {
            const res = await patchMyProfile(patchBody(fields.values));
            if (!res.ok) {
                const d = await res.json();
                setError(d.error || 'Failed to save');
                return;
            }
            setSaved(true);
            refetch();
            setTimeout(() => setSaved(false), SAVED_BADGE_MS);
        } catch {
            setError('Network error — try again');
        } finally {
            setSaving(false);
        }
    };

    return { ...fields, saving, saved, error, avatarUploading, fileInputRef, handleAvatarUpload, handleSave };
}

export type ProfileSettingsForm = ReturnType<typeof useProfileSettings>;
