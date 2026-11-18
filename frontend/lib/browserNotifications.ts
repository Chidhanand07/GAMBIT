// The browser's Notification API behind three small functions ("Browser notifications" setting,
// ADR F-140). Every call is safe where the API does not exist (SSR, old browsers, iOS tabs).

export type BrowserPermission = NotificationPermission | 'unsupported';

const api = (): typeof Notification | undefined =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification : undefined;

export function browserPermission(): BrowserPermission {
    return api()?.permission ?? 'unsupported';
}

/** Asks the browser for permission (call from a click); resolves with the answer. */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
    const N = api();
    if (!N) return 'unsupported';
    try {
        return await N.requestPermission();
    } catch {
        return N.permission;
    }
}

/**
 * Shows a desktop notification, only while the page is in the background (in the foreground the
 * app's own toast is shown) and only with permission. Returns whether one was shown.
 */
export function showBackgroundNotification(title: string, body: string): boolean {
    const N = api();
    if (!N || N.permission !== 'granted' || typeof document === 'undefined' || !document.hidden) return false;
    try {
        new N(title, { body, tag: title });
        return true;
    } catch {
        return false;
    }
}
