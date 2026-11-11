import { Camera, Loader2 } from 'lucide-react';
import type { ProfileSettingsForm } from '../hooks/useProfileSettings';
import type { SettingsProfile } from '../types';

export function AvatarEditor({ profile, form }: { profile: SettingsProfile; form: ProfileSettingsForm }) {
    const { avatarUrl, avatarUploading, fileInputRef, handleAvatarUpload } = form;
    return (
        <div className="flex items-center gap-5">
            <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-full bg-elevated border-2 border-border-strong flex items-center justify-center overflow-hidden">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-accent text-2xl font-medium select-none">
                            {(profile.display_name || profile.username || '?')[0].toUpperCase()}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute bottom-0 right-0 w-7 h-7 bg-accent rounded-full flex items-center justify-center border-2 border-page cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-60"
                >
                    {avatarUploading ? (
                        <Loader2 size={13} className="text-surface animate-spin" />
                    ) : (
                        <Camera size={13} className="text-surface" strokeWidth={1.5} />
                    )}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                />
            </div>
            <div>
                <div className="text-text-primary font-medium">{profile.display_name || profile.username}</div>
                <div className="text-text-tertiary text-sm">@{profile.username}</div>
                <div className="text-text-tertiary text-xs mt-1">
                    Member since {new Date(profile.created_at).getFullYear()}
                </div>
                {avatarUploading && <div className="text-xs text-accent mt-1">Uploading…</div>}
            </div>
        </div>
    );
}
