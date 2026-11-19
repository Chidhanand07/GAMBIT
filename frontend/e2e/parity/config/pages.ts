/**
 * Every page the parity harness compares, with its masks and interactive states (ADR F-096).
 * Mockup selectors were checked against the rendered mockups at 1440 px; a selector that finds
 * nothing is reported as a "mask miss" in PARITY.md rather than failing the run.
 */
import { CLOCK_MASK, HEADER_MASKS, HEADER_MENU_SCENARIOS, IDENTITY_MASKS, INPUT_MASK } from './masks';
import type { ParityPage, ParityScenario } from './types';

const DEFAULT: ParityScenario = { id: 'default', label: 'Default' };

const click = (app: string, mockup: string = app) => ({ action: 'click' as const, app, mockup });
/** A state reached by one click; `target` is one selector for both sides or one per side. */
const tab = (
    id: string,
    label: string,
    target: string | { app: string; mockup: string },
    extra: Partial<ParityScenario> = {},
) => ({
    id,
    label,
    steps: [typeof target === 'string' ? click(target) : click(target.app, target.mockup)],
    ...extra,
});

const SHOW_PASSWORD: ParityScenario = {
    id: 'show-password',
    label: 'Password shown',
    steps: [click('role=button[name="Show"] >> nth=0')],
};

const PUBLIC_PAGES: readonly ParityPage[] = [
    {
        id: 'home-signed-out',
        label: 'Home (signed out)',
        mockupFile: 'Home.dc.html',
        route: '/',
        role: 'anon',
        masks: [
            {
                key: 'header-variant',
                mockup: 'header',
                app: 'header',
                note: 'Home.dc.html draws the signed-in header; the signed-out header is compared on Signin/Signup',
            },
        ],
        scenarios: [DEFAULT],
    },
    {
        id: 'signin',
        label: 'Signin',
        mockupFile: 'Signin.dc.html',
        route: '/login',
        role: 'anon',
        masks: [],
        scenarios: [DEFAULT, SHOW_PASSWORD],
    },
    {
        id: 'signup',
        label: 'Signup',
        mockupFile: 'Signup.dc.html',
        route: '/signup',
        role: 'anon',
        masks: [],
        scenarios: [DEFAULT, SHOW_PASSWORD],
    },
];

const both = (key: string, selector: string) => ({ key, mockup: selector, app: selector });

const LOBBY_MASKS = [
    ...HEADER_MASKS,
    both('lobby-welcome', 'text=/^Welcome back,/'),
    both('lobby-rating', 'text=/^(Bullet|Blitz|Rapid|Classical|Daily) rating$/ >> xpath=../../*'),
    both('lobby-live-count', 'text=/^\\d+ now$/'),
    both('lobby-live-game', 'text="Live games" >> xpath=../following-sibling::*'),
];

const GAME_MASKS = [
    { key: 'game-title', mockup: 'text=/^Game vs /', app: 'text=/^Game vs /' },
    { key: 'game-watching', mockup: 'text=/watching$/', app: 'text=/watching$/' },
    {
        key: 'game-seat-top',
        mockup: 'text="MAVERICK" >> xpath=../../..',
        app: '[role=timer] >> xpath=preceding-sibling::*',
    },
    {
        key: 'game-avatar-top',
        mockup: 'text="MAVERICK" >> xpath=../../../../*[1]',
        app: '[role=timer] >> xpath=preceding-sibling::*[1]',
    },
    {
        key: 'game-seat-bottom',
        mockup: 'text="Maverick 1" >> xpath=../..',
        app: '[role=timer] >> xpath=preceding-sibling::*',
    },
    {
        key: 'game-avatar-bottom',
        mockup: 'text="Maverick 1" >> xpath=../../../*[1]',
        app: '[role=timer] >> xpath=preceding-sibling::*[1]',
    },
    CLOCK_MASK,
    {
        key: 'game-moves',
        mockup: 'text="Nf3" >> xpath=../../..',
        app: 'section[aria-label="Moves"] > div:nth-child(2)',
    },
    { key: 'game-chat-empty', mockup: 'text=/^Say something to /', app: 'text=/^Say something to /' },
];

const LEADERBOARD_MASKS = [
    ...HEADER_MASKS,
    { key: 'lb-podium-card', mockup: 'text="1376" >> xpath=../../*', app: '[aria-label="Top three"] > *' },
    {
        key: 'lb-row',
        mockup: 'text="Win rate" >> xpath=../following-sibling::*',
        app: '[aria-label="Rankings"] > [role=row] ~ [role=row]',
    },
    {
        key: 'lb-standing',
        mockup: 'text="Your standing" >> xpath=following-sibling::*[position()<=2]',
        app: 'text="Your standing" >> xpath=following-sibling::*[position()<=2]',
    },
    {
        key: 'lb-stat-value',
        mockup: 'text=/^(Total players|Avg rating|Online now)$/ >> xpath=preceding-sibling::*',
        app: 'text=/^(Total players|Avg rating|Online now)$/ >> xpath=preceding-sibling::*',
    },
];

const PROFILE_MASKS = [
    ...HEADER_MASKS,
    ...IDENTITY_MASKS,
    { key: 'profile-games-count', mockup: 'text=/^Games \\(\\d+\\)$/', app: 'text=/^Games \\(\\d+\\)$/' },
];

/** Overview: the values, not the cards that hold them. */
const PROFILE_OVERVIEW_MASKS = [
    {
        key: 'profile-about',
        mockup: 'text="Member since" >> xpath=../../..',
        app: 'text="Member since" >> xpath=../..',
    },
    {
        key: 'profile-friend',
        mockup: 'text="See all" >> xpath=../following-sibling::*',
        app: 'text="See all" >> xpath=../following-sibling::*',
    },
    {
        key: 'profile-achievements',
        mockup: 'text="Achievements" >> xpath=following-sibling::*',
        app: 'text="Achievements" >> xpath=following-sibling::*',
    },
    {
        key: 'profile-recent',
        mockup: 'text="Recent games" >> xpath=../following-sibling::*',
        app: 'text="Recent games" >> xpath=../following-sibling::*',
    },
];

/** Games, Stats and Friends tabs are all data: only the panels' frames and positions count. */
const PROFILE_PANEL_MASK = {
    key: 'profile-panel',
    mockup: 'main section:not(:has-text("Edit profile"))',
    app: '[aria-label="Profile sections"] ~ *',
    note: "tab content is all data; only the panels' outline and position are compared",
};

const profileTab = (id: string, label: string, text: string) =>
    tab(
        id,
        label,
        { app: `[aria-label="Profile sections"] >> text=${text}`, mockup: `main >> text=${text}` },
        { masks: [PROFILE_PANEL_MASK] },
    );

const settingsTab = (id: string, label: string, extra: Partial<ParityScenario> = {}) =>
    tab(id, label, `main >> text="${label}"`, extra);

const SIGNED_IN_PAGES: readonly ParityPage[] = [
    {
        id: 'home-signed-in',
        label: 'Home (signed in)',
        mockupFile: 'Home.dc.html',
        route: '/',
        role: 'white',
        masks: HEADER_MASKS,
        scenarios: [DEFAULT],
    },
    {
        id: 'lobby',
        label: 'Lobby (Main)',
        mockupFile: 'Main.dc.html',
        route: '/lobby',
        role: 'white',
        masks: LOBBY_MASKS,
        scenarios: [
            DEFAULT,
            ...HEADER_MENU_SCENARIOS,
            tab('custom', 'Custom time control', 'text="Custom"'),
            tab('computer', 'Computer panel', 'role=button[name="Computer"]'),
            tab('friend', 'Friend panel', 'role=button[name="Friend"]'),
            tab('searching', 'Finding an opponent', 'role=button[name="Play Online"]'),
        ],
    },
    {
        id: 'game',
        label: 'Game (live, as white)',
        mockupFile: 'Game.dc.html',
        route: null,
        role: 'white',
        masks: GAME_MASKS,
        note: 'a real private game, 3+0 rated, after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 (the mockup position)',
        scenarios: [
            DEFAULT,
            tab('focus', 'Focus mode', 'role=button[name="Focus mode"]'),
            tab('resign-dialog', 'Resign dialog', 'role=button[name="Resign"]'),
            tab('draw-offer', 'Draw offer', 'role=button[name="Draw"]'),
        ],
    },
    {
        id: 'leaderboard',
        label: 'Leaderboard',
        mockupFile: 'Leaderboard.dc.html',
        route: '/leaderboard',
        role: 'white',
        masks: LEADERBOARD_MASKS,
        scenarios: [DEFAULT],
    },
    {
        id: 'analysis',
        label: 'Analysis',
        mockupFile: 'Analysis.dc.html',
        route: '/analysis',
        role: 'white',
        masks: HEADER_MASKS,
        scenarios: [DEFAULT, tab('import', 'Import tab', 'text="Import"')],
    },
    {
        id: 'profile',
        label: 'Profile (own)',
        mockupFile: 'Profile.dc.html',
        route: '/profile/parity_white',
        role: 'white',
        masks: PROFILE_MASKS,
        scenarios: [
            { id: 'overview', label: 'Overview tab', masks: PROFILE_OVERVIEW_MASKS },
            profileTab('games', 'Games tab', '/^Games \\(/'),
            profileTab('stats', 'Stats tab', '"Stats"'),
            profileTab('friends', 'Friends tab', '"Friends" >> nth=0'),
        ],
    },
    {
        id: 'settings',
        label: 'Settings',
        mockupFile: 'Settings.dc.html',
        route: '/settings',
        role: 'white',
        masks: HEADER_MASKS,
        scenarios: [
            {
                id: 'public-profile',
                label: 'Public profile tab',
                masks: [
                    ...IDENTITY_MASKS,
                    INPUT_MASK,
                    {
                        key: 'settings-preview',
                        mockup: 'text=/^live preview$/i >> xpath=following-sibling::*',
                        app: 'text=/^live preview$/i >> xpath=following-sibling::*',
                    },
                ],
            },
            settingsTab('board', 'Board & pieces'),
            settingsTab('gameplay', 'Gameplay'),
            settingsTab('notifications', 'Notifications'),
            settingsTab('privacy', 'Privacy'),
            settingsTab('account', 'Account', { masks: [INPUT_MASK] }),
        ],
    },
];

export const PARITY_PAGES: readonly ParityPage[] = [...PUBLIC_PAGES, ...SIGNED_IN_PAGES];
