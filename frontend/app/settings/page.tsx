"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useProfile } from '@/components/ProfileProvider';
import { useProfileSettings } from '@/features/settings/hooks/useProfileSettings';
import { ProfileSection } from '@/features/settings/components/ProfileSection';
import { AccountSection } from '@/features/settings/components/AccountSection';

const NAV = [
    { id: 'profile', label: 'Public Profile' },
    { id: 'account', label: 'Account' },
];

function SettingsNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
    return (
        <nav className="space-y-0.5">
            {NAV.map(s => (
                <button key={s.id} onClick={() => onSelect(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                        active === s.id ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                    }`}>
                    {s.label}
                </button>
            ))}
        </nav>
    );
}

export default function SettingsPage() {
    const router = useRouter();
    const { profile, loading: profileLoading, refetch } = useProfile();
    const [activeSection, setActiveSection] = useState('profile');
    const form = useProfileSettings(profile, refetch);

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
                    <SettingsNav active={activeSection} onSelect={setActiveSection} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {activeSection === 'profile' && (
                        <ProfileSection profile={profile} form={form} onCancel={() => router.back()} />
                    )}

                    {activeSection === 'account' && <AccountSection profile={profile} />}
                </div>
            </div>
        </div>
    );
}
