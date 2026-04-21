"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, MapPin, FileText, Camera, Check, Loader2, ChevronLeft } from 'lucide-react';
import { useProfile } from '@/components/ProfileProvider';
import { createClient } from '@/lib/supabase/client';

const NAV = [
    { id: 'profile', label: 'Public Profile' },
    { id: 'account', label: 'Account' },
];

export default function SettingsPage() {
    const router = useRouter();
    const { profile, loading: profileLoading, refetch } = useProfile();
    const [activeSection, setActiveSection] = useState('profile');

    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [country, setCountry] = useState('');

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || '');
            setBio(profile.bio || '');
            setCountry(profile.country || '');
            setAvatarUrl(profile.avatar_url || null);
        }
    }, [profile?.id]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        setAvatarUploading(true);
        try {
            const supabase = createClient();
            const ext = file.name.split('.').pop();
            const path = `${profile.id}/avatar.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('avatars')
                .upload(path, file, { upsert: true });
            if (uploadErr) { setError('Upload failed: ' + uploadErr.message); return; }
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
            // Save to profile
            await fetch('/api/profile/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatarUrl: publicUrl }),
            });
            setAvatarUrl(publicUrl + '?t=' + Date.now());
            refetch();
        } catch { setError('Upload failed — try again'); }
        finally { setAvatarUploading(false); }
    };

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/profile/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: displayName.trim() || null,
                    bio: bio.trim() || null,
                    country: country.trim() || null,
                }),
            });
            if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save'); return; }
            setSaved(true);
            refetch();
            setTimeout(() => setSaved(false), 2500);
        } catch { setError('Network error — try again'); }
        finally { setSaving(false); }
    };

    if (profileLoading) return (
        <div className="flex justify-center items-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    );

    if (!profile) { router.push('/login'); return null; }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="flex items-center gap-3 mb-8">
                <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary transition-colors p-1">
                    <ChevronLeft size={20} strokeWidth={1.5} />
                </button>
                <h1 className="text-2xl font-medium text-text-primary">Settings</h1>
            </div>

            <div className="flex gap-6">
                {/* Sidebar */}
                <div className="w-52 shrink-0">
                    <nav className="space-y-0.5">
                        {NAV.map(s => (
                            <button key={s.id} onClick={() => setActiveSection(s.id)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                                    activeSection === s.id ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                                }`}>
                                {s.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {activeSection === 'profile' && (
                        <div className="bg-surface border border-border rounded-xl overflow-hidden">
                            <div className="px-6 py-5 border-b border-border bg-elevated">
                                <h2 className="text-lg font-medium text-text-primary">Public Profile</h2>
                                <p className="text-text-tertiary text-sm mt-0.5">Visible to everyone on your profile page.</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Avatar */}
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
                                            className="absolute bottom-0 right-0 w-7 h-7 bg-accent rounded-full flex items-center justify-center border-2 border-page cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-60">
                                            {avatarUploading
                                                ? <Loader2 size={13} className="text-surface animate-spin" />
                                                : <Camera size={13} className="text-surface" strokeWidth={1.5} />
                                            }
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
                                        <div className="text-text-tertiary text-xs mt-1">Member since {new Date(profile.created_at).getFullYear()}</div>
                                        {avatarUploading && <div className="text-xs text-accent mt-1">Uploading…</div>}
                                    </div>
                                </div>

                                {/* Display Name */}
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Display Name</label>
                                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                                        placeholder={profile.username} maxLength={30}
                                        className="w-full h-11 bg-elevated border border-border-strong rounded-lg px-4 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors" />
                                    <p className="text-text-tertiary text-xs mt-1">Shown in games and on your profile. Leave blank to use username.</p>
                                </div>

                                {/* Bio */}
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Bio</label>
                                    <textarea value={bio} onChange={e => setBio(e.target.value)}
                                        placeholder="Tell other players about yourself..." maxLength={160} rows={4}
                                        className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none" />
                                    <div className="flex justify-end mt-1">
                                        <span className="text-text-tertiary text-xs">{bio.length}/160</span>
                                    </div>
                                </div>

                                {/* Country */}
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                        <MapPin size={13} className="inline mr-1" strokeWidth={1.5} />Country
                                    </label>
                                    <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                                        placeholder="e.g. India" maxLength={60}
                                        className="w-full h-11 bg-elevated border border-border-strong rounded-lg px-4 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors" />
                                </div>

                                {error && <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

                                <div className="flex items-center gap-3 pt-2 border-t border-border">
                                    <button onClick={handleSave} disabled={saving}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface font-medium rounded-lg transition-colors">
                                        {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
                                        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                                    </button>
                                    <button onClick={() => router.back()} className="px-4 py-2.5 text-text-secondary hover:text-text-primary text-sm transition-colors">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === 'account' && (
                        <div className="bg-surface border border-border rounded-xl overflow-hidden">
                            <div className="px-6 py-5 border-b border-border bg-elevated">
                                <h2 className="text-lg font-medium text-text-primary">Account</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Username</label>
                                    <div className="flex gap-2 items-center">
                                        <input type="text" value={profile.username} disabled
                                            className="flex-1 h-11 bg-elevated border border-border rounded-lg px-4 text-text-tertiary cursor-not-allowed" />
                                        <span className="text-text-tertiary text-xs px-3">Read-only</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Ratings</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Bullet', val: profile.rating_bullet },
                                            { label: 'Blitz', val: profile.rating_blitz },
                                            { label: 'Rapid', val: profile.rating_rapid },
                                            { label: 'Classical', val: profile.rating_classical },
                                        ].map(r => (
                                            <div key={r.label} className="flex justify-between items-center bg-elevated border border-border rounded-lg px-4 py-2.5">
                                                <span className="text-text-secondary text-sm">{r.label}</span>
                                                <span className="text-accent font-medium tabular-nums">{Math.round(r.val ?? 1200)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
