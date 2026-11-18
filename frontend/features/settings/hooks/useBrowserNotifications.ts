import { useState } from 'react';
import { browserPermission, requestBrowserPermission, type BrowserPermission } from '@/lib/browserNotifications';

export type { BrowserPermission };

/**
 * The browser's notification permission, and `request()` for the moment the "Browser
 * notifications" switch is turned on (a click, so the browser shows its prompt).
 */
export function useBrowserNotifications() {
    const [permission, setPermission] = useState<BrowserPermission>(() => browserPermission());
    const request = async () => {
        const answer = await requestBrowserPermission();
        setPermission(answer);
        return answer;
    };
    return { permission, request };
}
