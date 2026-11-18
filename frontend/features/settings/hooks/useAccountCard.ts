import type { AccountPrefsDraft } from './useAccountPrefsDraft';
import { useAuthAccount } from './useAuthAccount';
import { useEmailChange } from './useEmailChange';
import { useEmailLinkResult } from './useEmailLinkResult';

/**
 * The Account card (Settings.dc.html "Account"): sign-in e-mail and its change, the account
 * switches, and the card's Save / Reset.
 */
export function useAccountCard(prefs: AccountPrefsDraft) {
    const auth = useAuthAccount();
    const emailChange = useEmailChange(auth);
    const emailLink = useEmailLinkResult();

    /** "Save changes": a changed e-mail first (it shows its own states), then the switches. */
    const save = async () => {
        if ((await emailChange.submit()) === 'error') return;
        await prefs.commit();
    };
    /** Part of the page's one "Reset to defaults": the e-mail field shows the current address again. */
    const reset = () => emailChange.reset();

    return { email: auth.email, emailChange, emailLink, save, reset };
}

export type AccountCardState = ReturnType<typeof useAccountCard>;
