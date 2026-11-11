// Client-side fetch helpers for the Navbar notification bell.

/** GET /api/notifications (no options). */
export function getNotifications(): Promise<Response> {
    return fetch('/api/notifications');
}

/** PUT /api/notifications/read — marks all of the caller's notifications read. */
export function markNotificationsRead(): Promise<Response> {
    return fetch('/api/notifications/read', { method: 'PUT' });
}
