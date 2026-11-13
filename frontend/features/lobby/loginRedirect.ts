// Where a signed-out visitor is sent when an action needs an account (F10).
import { safeRedirectPath } from '@/lib/safeRedirect';

export const LOGIN_PATH = '/login';
/** Query parameter the login page reads (app/login, through safeRedirectPath). */
export const LOGIN_REDIRECT_PARAM = 'redirect';

/** `/login?redirect=<path>`, so signing in returns to `returnTo` (only a same-site path is kept). */
export function loginHref(returnTo: string): string {
    const params = new URLSearchParams({ [LOGIN_REDIRECT_PARAM]: safeRedirectPath(returnTo) });
    return `${LOGIN_PATH}?${params.toString()}`;
}
