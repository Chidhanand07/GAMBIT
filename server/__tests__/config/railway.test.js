/**
 * server/railway.toml: the Railway healthcheck targets /readyz (NODE-21), the route that
 * checks Redis and Supabase and answers 503 while draining. ADR F-071.
 */
const fs = require('node:fs');
const path = require('node:path');

const RAILWAY_TOML = path.join(__dirname, '..', '..', 'railway.toml');

/** The value of `key = "value"` inside `[section]` (the file is flat TOML; no parser dependency). */
function tomlValue(text, section, key) {
    const body = text.split(/^\[/m).find((part) => part.startsWith(`${section}]`));
    const match = body?.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
    return match?.[1];
}

test('the deploy healthcheck is /readyz [OBSERVABILITY] (was /api/health)', () => {
    const text = fs.readFileSync(RAILWAY_TOML, 'utf8');
    expect(tomlValue(text, 'deploy', 'healthcheckPath')).toBe('/readyz');
});

test('the path the healthcheck targets is a route of the app', () => {
    const { registerStatusRoutes } = require('../../src/http/routes/status');
    const paths = [];
    registerStatusRoutes({ get: (p) => paths.push(p) }, { queueSize: () => 0, readiness: { check: async () => ({}) } });
    const text = fs.readFileSync(RAILWAY_TOML, 'utf8');
    expect(paths).toContain(tomlValue(text, 'deploy', 'healthcheckPath'));
});
