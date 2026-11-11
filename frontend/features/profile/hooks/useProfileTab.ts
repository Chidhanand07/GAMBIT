import { useEffect, useState } from 'react';
import { PROFILE_TABS, type ProfileTab } from '../types';

/**
 * Active profile tab. On mount, a `#overview|#games|#stats|#friends` URL hash
 * (e.g. from the navbar's "My Games" link) selects that tab.
 */
export function useProfileTab() {
    const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

    useEffect(() => {
        const hash = window.location.hash.replace('#', '') as ProfileTab;
        if (PROFILE_TABS.includes(hash)) {
            setActiveTab(hash);
        }
    }, []);

    return { activeTab, setActiveTab };
}
