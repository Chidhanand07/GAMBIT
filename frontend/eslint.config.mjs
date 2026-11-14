// ESLint flat config for the Next.js app (docs/ENGINEERING_RULES.md).
// Next 16 removed `next lint`; CI and local runs use the ESLint CLI (`npx eslint .`) with this file.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { baselineBlock } = require('../scripts/lint-baseline/eslint-baseline.js');
const here = path.dirname(fileURLToPath(import.meta.url));

const sizeRules = {
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }], // SIZE-01
    'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }], // SIZE-02
    complexity: ['error', { max: 10, variant: 'modified' }], // SIZE-03
    'max-params': ['error', 4], // SIZE-04
    'max-depth': ['error', 3],
    'max-nested-callbacks': ['error', 3],
};

/** Files that only ever run on the server (never bundled for a browser). */
const serverOnlyFiles = ['lib/server/**/*.ts', 'app/api/**/*.ts', 'app/**/route.ts', 'proxy.ts'];

const strict = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        name: 'gambit/frontend',
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: here },
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { import: importPlugin, 'react-hooks': reactHooks, '@next/next': nextPlugin },
        settings: { 'import/resolver': { typescript: { project: path.join(here, 'tsconfig.json') } } },
        rules: {
            ...sizeRules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'import/no-cycle': ['error', { ignoreExternal: true }], // SOLID-12
            '@typescript-eslint/no-floating-promises': 'error', // NODE-06
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
    {
        name: 'gambit/frontend-tsx',
        files: ['**/*.tsx'],
        rules: { 'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }] }, // SIZE-02
    },
];

export default [
    { ignores: ['node_modules/**', '.next/**', 'coverage/**', 'public/**', 'next-env.d.ts', '*.config.js', '__mocks__/**', 'eslint.config.mjs'] },
    ...strict,
    {
        name: 'gambit/tests',
        files: ['__tests__/**/*.{ts,tsx}', 'jest.setup.ts'],
        languageOptions: { globals: { ...globals.jest } },
        rules: {
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            'max-nested-callbacks': 'off',
            complexity: 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    ...baselineBlock(here, strict),
    // ── console (S14, SEC-01) ────────────────────────────────────────────────────────────────
    // These blocks come after the legacy baseline on purpose: the baseline may never downgrade them.
    {
        // Everything is client code unless listed below: nothing that can reach a browser may
        // write to the console (the sign-up flow used to log the e-mail, session expiry and
        // auth cookie names there).
        name: 'gambit/no-console',
        files: ['**/*.{ts,tsx}'],
        rules: { 'no-console': 'error' },
    },
    {
        // Server-only code: route handlers, the data access layer and the proxy. Their output
        // goes to the server log, never to a browser, so reporting a failure with
        // console.error / console.warn is legitimate. console.log/info/debug stay banned
        // (no debug chatter; secrets never go in logs, SEC-01).
        // Keep in step with `isServerOnly` in __tests__/security/noClientConsole.test.ts.
        name: 'gambit/no-console-server',
        files: serverOnlyFiles,
        rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
    },
    {
        // Not shipped to anyone: tests, scripts and tool configuration.
        name: 'gambit/console-allowed',
        files: ['__tests__/**/*.{ts,tsx}', 'jest.setup.ts', 'scripts/**', '*.config.{ts,mts,mjs,js}'],
        rules: { 'no-console': 'off' },
    },
];
