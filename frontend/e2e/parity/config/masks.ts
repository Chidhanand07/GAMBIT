/**
 * Mask definitions shared by several pages. Where the app and the mockup have the same
 * accessible names, text and structure, one Playwright selector serves both sides; a
 * `[data-parity-mask=…]` attribute in the app is the fallback for regions without such a hook.
 */
import type { ParityMask } from './types';

/** Signed-in header: the live "N online" count and the account button (avatar + name). */
export const HEADER_MASKS: readonly ParityMask[] = [
    { key: 'header-online', mockup: 'header >> text=/online/', app: 'header >> text=/online/' },
    { key: 'header-account', mockup: 'role=button[name=/^Account menu/]', app: 'role=button[name=/^Account menu/]' },
];

/** The handle line and the name above it, wherever a page shows "@username" in <main>. */
export const IDENTITY_MASKS: readonly ParityMask[] = [
    { key: 'identity', mockup: 'main >> text=/^@\\w+$/ >> xpath=..', app: 'main >> text=/^@\\w+$/ >> xpath=..' },
    {
        key: 'identity-avatar',
        mockup: 'main >> text=/^@\\w+$/ >> xpath=../preceding-sibling::*[1]',
        app: 'main >> text=/^@\\w+$/ >> xpath=../preceding-sibling::*[1]',
    },
];

/** Text inputs and text areas hold the account's own values (names, bio, e-mail). */
export const INPUT_MASK: ParityMask = {
    key: 'inputs',
    mockup: 'main input:not([type=checkbox]):not([type=radio]):not([type=range]), main textarea',
    app: 'main input:not([type=checkbox]):not([type=radio]):not([type=range]), main textarea',
};

/** Clocks ("2:48", "0:59.4"): live time on both sides. */
export const CLOCK_MASK: ParityMask = {
    key: 'clock',
    mockup: 'text=/^\\d+:\\d\\d(\\.\\d)?$/',
    app: 'text=/^\\d+:\\d\\d(\\.\\d)?$/',
};

/** Header menus (Main.dc.html): every signed-in page shares the header, so the lobby covers them. */
export const HEADER_MENU_SCENARIOS = [
    {
        id: 'notifications',
        label: 'Notifications menu',
        steps: [
            { action: 'click', app: 'role=button[name="Notifications"]', mockup: 'role=button[name="Notifications"]' },
        ],
        masks: [{ key: 'notification-rows', mockup: 'role=menu >> role=menuitem', app: 'role=menu >> role=menuitem' }],
    },
    {
        id: 'account-menu',
        label: 'Account menu',
        steps: [
            { action: 'click', app: 'role=button[name=/^Account menu/]', mockup: 'role=button[name=/^Account menu/]' },
        ],
    },
    {
        id: 'site-menu',
        label: 'Site menu',
        steps: [{ action: 'click', app: 'role=button[name="Menu"]', mockup: 'role=button[name="Menu"]' }],
    },
] as const;
