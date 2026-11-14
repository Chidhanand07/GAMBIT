/**
 * NODE-RUNTIME (NODE-01): one Node LTS line, pinned identically wherever a runtime is chosen:
 * `engines`, .nvmrc, the Docker image Railway builds, and CI.
 */
const fs = require('node:fs');
const path = require('node:path');

const NODE_MAJOR = 26;
const root = path.join(__dirname, '..', '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));

describe('Node runtime is pinned to one LTS line [NODE-RUNTIME]', () => {
    test.each(['server', 'frontend'])('%s/package.json engines.node', (pkg) => {
        expect(json(pkg, 'package.json').engines).toEqual({ node: `${NODE_MAJOR}.x` });
    });

    test('.nvmrc at the root names the same major', () => {
        expect(read('.nvmrc').trim()).toBe(String(NODE_MAJOR));
    });

    test('the server image is built from the same major and installs from the lockfile', () => {
        const dockerfile = read('server', 'Dockerfile');
        expect(dockerfile).toMatch(new RegExp(`^FROM node:${NODE_MAJOR}-alpine`, 'm'));
        expect(dockerfile).toMatch(/npm ci --omit=dev/);
        expect(dockerfile).not.toMatch(/npm install/);
    });

    test('Railway builds that Dockerfile (no builder that picks its own Node)', () => {
        const railway = read('server', 'railway.toml');
        expect(railway).toMatch(/builder\s*=\s*"DOCKERFILE"/);
        expect(railway).not.toMatch(/NIXPACKS/);
    });

    test('every CI setup-node step reads the version from .nvmrc', () => {
        const workflows = fs.readdirSync(path.join(root, '.github', 'workflows'));
        const setups = workflows.flatMap((file) => {
            const text = read('.github', 'workflows', file);
            return text.split('actions/setup-node').slice(1).map((rest) => rest.split('- ')[0]);
        });
        expect(setups.length).toBeGreaterThan(0);
        for (const step of setups) {
            expect(step).toMatch(/node-version-file:\s*\.nvmrc/);
            expect(step).not.toMatch(/node-version:/);
        }
    });

    test('the Supabase client is not held back for an old Node', () => {
        for (const pkg of ['server', 'frontend']) {
            const range = json(pkg, 'package.json').dependencies['@supabase/supabase-js'];
            expect(range).toMatch(/^\^2\./);
        }
        expect(json('frontend', 'package.json').dependencies['@supabase/ssr']).toMatch(/^\^0\.\d+\./);
    });
});
