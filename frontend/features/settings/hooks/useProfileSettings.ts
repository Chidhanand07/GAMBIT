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

/**
 * Editable fields, prefilled when a (different) profile loads. Keyed on the profile id, so a
 * refetch of the same profile does not wipe unsaved edits. The prefill is a state adjustment
 * during render (React's pattern for "reset state when a prop changes"), not an effect.
 */
function useProfileFields(profile: SettingsProfile | null) {
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [country, setCountry] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [prefilledFor, setPrefilledFor] = useState<string | undefined>(undefined);

    if (profile && profile.id !== prefilledFor) {
        setPrefilledFor(profile.id);
        setDisplayName(profile.display_name || '');
        setBio(profile.bio || '');
        setCountry(profile.country || '');
        setAvatarUrl(profile.avatar_url || null);
    }

    return { displayName, setDisplayName, bio, setBio, country, setCountry, avatarUrl, setAvatarUrl };
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
            const res = await patchMyProfile({
                displayName: fields.displayName.trim() || null,
                bio: fields.bio.trim() || null,
                country: fields.country.trim() || null,
            });
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
