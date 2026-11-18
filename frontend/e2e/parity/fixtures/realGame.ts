/**
 * A REAL game between the seeded white and black accounts (ADR F-098), through the private
 * invite flow, which is deterministic (matchmaking pairs whoever is queued):
 *   1. white creates a rated 3+0 private game as white (POST /api/games/private/create, the
 *      lobby's own call, with white's session cookie);
 *   2. black opens /join/<token> and presses "Accept & Play" (the real UI and game server);
 *   3. both open /game/<id> and play 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 by clicking squares, so the
 *      board, move list and "Your move" state match Game.dc.html.
 * Needs the web app and scripts/test-db/stack.js (game server + Redis) on the test project.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { storageStatePath } from '../lib/testEnv';

/** The mockup's position: [from, to] squares, white first. */
const MOCKUP_MOVES: readonly (readonly [string, string])[] = [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['f8', 'c5'],
];
const GAME_URL = /\/game\/([0-9a-f-]{36})/;
const MOVE_TIMEOUT_MS = 15000;
const JOIN_TIMEOUT_MS = 30000;

export interface LiveGame {
    gameId: string;
    white: Page;
    black: Page;
    close: () => Promise<void>;
}

async function createInvite(white: Page): Promise<string> {
    const res = await white.request.post('/api/games/private/create', {
        data: { timeControl: '3+0', color: 'white', isRated: true },
    });
    expect(res.ok(), `private game create: HTTP ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error('private game create returned no invite token');
    return body.token;
}

async function playMove(mover: Page, other: Page, [from, to]: readonly [string, string]): Promise<void> {
    await mover.locator(`[data-square="${from}"]`).first().click();
    await mover.locator(`[data-square="${to}"]`).first().click();
    // The move is accepted once the other player's board shows the piece leaving `from`.
    await expect(other.locator(`[data-square="${from}"] [data-piece]`)).toHaveCount(0, {
        timeout: MOVE_TIMEOUT_MS,
    });
}

/** Starts the game and plays the mockup's moves; `close()` resigns as black and closes both contexts. */
export async function startRealGame(browser: Browser, viewport: { width: number; height: number }): Promise<LiveGame> {
    const contexts: BrowserContext[] = [];
    const open = async (role: 'white' | 'black') => {
        const ctx = await browser.newContext({
            storageState: storageStatePath(role),
            viewport,
            reducedMotion: 'reduce',
        });
        contexts.push(ctx);
        return ctx.newPage();
    };
    const white = await open('white');
    const black = await open('black');
    await white.goto('/lobby');
    const token = await createInvite(white);
    await black.goto(`/join/${token}`);
    await black.getByRole('button', { name: /Accept & Play/ }).click();
    await black.waitForURL(GAME_URL, { timeout: JOIN_TIMEOUT_MS });
    const gameId = GAME_URL.exec(black.url())?.[1] ?? '';
    await white.goto(`/game/${gameId}`);
    for (let i = 0; i < MOCKUP_MOVES.length; i += 1) {
        const [mover, other] = i % 2 === 0 ? [white, black] : [black, white];
        await playMove(mover, other, MOCKUP_MOVES[i]);
    }
    const close = async () => {
        await black
            .getByRole('button', { name: 'Resign' })
            .click()
            .catch(() => undefined);
        await black
            .getByRole('button', { name: 'Yes, resign' })
            .click()
            .catch(() => undefined);
        await Promise.all(contexts.map((c) => c.close()));
    };
    return { gameId, white, black, close };
}
