'use client';

import { useEffect, useState } from 'react';
import { AWAY_AFTER_MS, type TabStatus } from '@/lib/presence/presenceStatus';

/** Input that shows someone is at this tab. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
/** Pointer moves arrive many times a second; the idle timer is restarted at most this often. */
const ACTIVITY_THROTTLE_MS = 1000;

/**
 * 'away' once this tab has had no input for `awayAfterMs` (a hidden tab gets none, so it goes
 * away on the same timer); 'online' again on the next input or when the tab becomes visible.
 * Inactive (always 'online', no listeners) while `enabled` is false.
 */
export function useIdleStatus(enabled: boolean, awayAfterMs = AWAY_AFTER_MS): TabStatus {
    const [status, setStatus] = useState<TabStatus>('online');

    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let lastReset = 0;
        const restart = () => {
            clearTimeout(timer);
            lastReset = Date.now();
            timer = setTimeout(() => setStatus('away'), awayAfterMs);
        };
        const onActivity = () => {
            setStatus('online');
            if (Date.now() - lastReset >= ACTIVITY_THROTTLE_MS) restart();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                setStatus('online');
                restart();
            }
        };
        restart();
        for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearTimeout(timer);
            for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [enabled, awayAfterMs]);

    return enabled ? status : 'online';
}
