import type { AccountPrefsDraft } from './useAccountPrefsDraft';
import { useAuthAccount } from './useAuthAccount';
import { useDeleteAccount } from './useDeleteAccount';
import { useEmailChange } from './useEmailChange';
import { useEmailLinkResult } from './useEmailLinkResult';
import { useTwoFactor } from './useTwoFactor';

/**
 * The Account card (Settings.dc.html "Account"): sign-in e-mail and its change, two-factor, the
 * account switches, account deletion, and the card's Save / Reset.
 */
export function useAccountCard(prefs: AccountPrefsDraft, username: string) {
    const auth = useAuthAccount();
    const deletion = useDeleteAccount(username, auth.hasPassword);
    const emailChange = useEmailChange(auth);
    const emailLink = useEmailLinkResult();
    const twoFactor = useTwoFactor();

    /** "Save changes": a changed e-mail first (it shows its own states), then the switches. */
    const save = async () => {
        if ((await emailChange.submit()) === 'error') return;
        await prefs.commit();
    };
    /** Part of the page's one "Reset to defaults": the e-mail field shows the current address again. */
    const reset = () => emailChange.reset();

    return { email: auth.email, emailChange, emailLink, twoFactor, deletion, save, reset };
}

export type AccountCardState = ReturnType<typeof useAccountCard>;
