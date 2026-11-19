import { useEffect, useState } from 'react';

/** What /auth/confirm reported in `?email=` after a confirmation link (ADR F-143). */
export type EmailLinkResult = 'confirmed' | 'link_invalid' | null;

const PARAM = 'email';

function readResult(): EmailLinkResult {
    const value = new URLSearchParams(window.location.search).get(PARAM);
    return value === 'confirmed' || value === 'link_invalid' ? value : null;
}

/**
 * The result of a followed e-mail confirmation link, read once after mount; the parameter is
 * then removed from the address bar so a reload does not show it again.
 */
export function useEmailLinkResult(): EmailLinkResult {
    const [result, setResult] = useState<EmailLinkResult>(null);
    useEffect(() => {
        const found = readResult();
        if (!found) return;
        setResult(found);
        const url = new URL(window.location.href);
        url.searchParams.delete(PARAM);
        window.history.replaceState(window.history.state, '', url.toString());
    }, []);
    return result;
}
