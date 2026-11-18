/**
 * Bridge to scripts/test-db (the env guard and the seeded accounts) for the TypeScript harness.
 * Signed-in pages run only when the guard accepts the TEST project's env files (ADR F-097).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT, settings } from '../config/settings';
import type { ParityRole } from '../config/types';

type EnvMap = Record<string, string>;
interface CheckResult {
    ok: boolean;
    problems?: string[];
    env?: { frontend: EnvMap; server: EnvMap; supabaseUrl: string; dbUrl: string };
}
interface EnvModule {
    checkTestEnv: () => CheckResult;
}

const requireScript = createRequire(__filename);
const envModule = requireScript(path.join(REPO_ROOT, 'scripts', 'test-db', 'env.js')) as EnvModule;

const DEFAULT_SERVER_PORT = 3202;
/** Game server port of scripts/test-db/stack.js. */
export const SERVER_PORT = Number(process.env.PARITY_SERVER_PORT || DEFAULT_SERVER_PORT);

export const PENDING_REASON = 'pending: test project env files (frontend/.env.test.local, server/.env.test)';

export function testEnvStatus(): CheckResult {
    return envModule.checkTestEnv();
}

/** Extra env for `next dev` when the test project is configured: its keys and the local game server. */
export function webServerEnv(): EnvMap {
    const status = testEnvStatus();
    if (!status.ok || !status.env) return {};
    return { ...status.env.frontend, NEXT_PUBLIC_SOCKET_URL: `http://127.0.0.1:${SERVER_PORT}` };
}

export interface SeededAccount {
    email: string;
    username: string;
    password: string;
}

const ACCOUNTS_FILE = path.join(settings.authDir, 'accounts.json');

/** The credentials scripts/test-db/seed.js wrote (git-ignored); throws if the seed never ran. */
export function readAccounts(): Record<string, SeededAccount> {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
        throw new Error(`${ACCOUNTS_FILE} is missing: run \`npm run test-db:seed\` first`);
    }
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) as Record<string, SeededAccount>;
}

export const storageStatePath = (role: Exclude<ParityRole, 'anon'>) => path.join(settings.authDir, `${role}.json`);
