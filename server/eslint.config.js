// ESLint flat config for the game server (docs/ENGINEERING_RULES.md).
const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');
const { baselineBlock } = require('../scripts/lint-baseline/eslint-baseline');

const sizeRules = {
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }], // SIZE-01
    'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }], // SIZE-02
    complexity: ['error', { max: 10, variant: 'modified' }], // SIZE-03
    'max-params': ['error', 4], // SIZE-04
    'max-depth': ['error', 3],
    'max-nested-callbacks': ['error', 3],
};

const strict = [
    js.configs.recommended,
    {
        name: 'gambit/server',
        files: ['**/*.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
        plugins: { import: importPlugin },
        rules: {
            ...sizeRules,
            'import/no-cycle': ['error', { ignoreExternal: true }], // SOLID-12
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
    {
        // Only clients/ may talk to the network (engine HTTP); see .dependency-cruiser.cjs for SDK imports.
        name: 'gambit/server-layers',
        files: ['src/**/*.js'],
        ignores: ['src/clients/**'],
        rules: {
            'no-restricted-globals': ['error', { name: 'fetch', message: 'SOLID-06: call the engine through src/clients/engineClient.js' }],
        },
    },
];

module.exports = [
    { ignores: ['node_modules/**', 'coverage/**'] },
    ...strict,
    {
        name: 'gambit/tests',
        files: ['__tests__/**/*.js'],
        languageOptions: { globals: { ...globals.jest } },
        rules: {
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            'max-nested-callbacks': 'off',
            complexity: 'off',
        },
    },
    ...baselineBlock(__dirname, strict),
];
