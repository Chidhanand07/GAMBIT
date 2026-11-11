import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Whether `profileId` is currently in the Supabase presence set. Opens a
 * uniquely named `presence-watch-<id>-<Date.now()>` channel keyed by the id and
 * removes it on unmount or id change.
 */
export function useProfilePresence(profileId: string | undefined) {
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        if (!profileId) return;
        let mounted = true;
        const supabase = createClient();
        const channel = supabase.channel(`presence-watch-${profileId}-${Date.now()}`, {
            config: { presence: { key: profileId } },
        });
        channel.on('presence', { event: 'sync' }, () => {
            if (!mounted) return;
            const state = channel.presenceState();
            setIsOnline(Object.keys(state).includes(profileId));
        });
        channel.subscribe();
        return () => {
            mounted = false;
            void supabase.removeChannel(channel);
        };
    }, [profileId]);

    return isOnline;
}
