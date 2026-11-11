/**
 * Layer rules for the game server (docs/ENGINEERING_RULES.md SOLID-06/07/12,
 * NODE-03). Run: `npx depcruise src server.js services lib supabase.js --config`.
 *
 *   domain/        pure: no other layer, no SDKs
 *   services/      domain + injected repositories/clients (no direct imports)
 *   repositories/  the only Supabase/Redis callers (plus clients/)
 *   clients/       SDK/HTTP adapters (Supabase, Redis, engine)
 *   http/, sockets/ entry adapters: services only
 *
 * Paths outside src/ are the pre-refactor legacy code. Their rules start as
 * "warn" (LEGACY_SEVERITY) and are switched to "error" when src/ owns them.
 */
const LEGACY_SEVERITY = 'warn';
const INFRA_SDKS = 'node_modules/(@supabase/supabase-js|ioredis)/';

module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            comment: 'SOLID-12: import cycles are forbidden.',
            from: { path: '^src/' },
            to: { circular: true },
        },
        {
            name: 'no-circular-legacy',
            severity: LEGACY_SEVERITY,
            from: { pathNot: '^src/' },
            to: { circular: true },
        },
        {
            name: 'domain-is-pure',
            severity: 'error',
            comment: 'SOLID-07: domain code needs no network, database, Redis or sockets.',
            from: { path: '^src/domain/' },
            to: { path: ['^src/(services|repositories|clients|http|sockets|config)/', 'node_modules/(@supabase|ioredis|socket\\.io|express|axios|cors)/', '^(server\\.js|supabase\\.js|services/|lib/)'] },
        },
        {
            name: 'services-receive-infrastructure-by-injection',
            severity: 'error',
            comment: 'SOLID-06: services get repositories/clients through factory arguments.',
            from: { path: '^src/services/' },
            to: { path: ['^src/(repositories|clients|http|sockets)/', INFRA_SDKS, '^(supabase\\.js|lib/)'] },
        },
        {
            name: 'only-adapters-import-infrastructure-sdks',
            severity: 'error',
            comment: 'SOLID-06: only repositories/ and clients/ may import Supabase or ioredis.',
            from: { path: '^src/', pathNot: '^src/(repositories|clients|index\\.js)' },
            to: { path: INFRA_SDKS },
        },
        {
            name: 'entry-adapters-call-services-only',
            severity: 'error',
            comment: 'NODE-03 / SIZE-05: http/ and sockets/ parse, call a service, respond.',
            from: { path: '^src/(http|sockets)/' },
            to: { path: ['^src/(repositories|clients|domain)/', INFRA_SDKS, '^(supabase\\.js|lib/|services/)'] },
        },
        {
            name: 'legacy-imports-infrastructure',
            severity: LEGACY_SEVERITY,
            comment: 'Legacy modules still import SDKs directly; removed as src/ takes over.',
            from: { path: '^(server\\.js|services/)' },
            to: { path: INFRA_SDKS },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '(^|/)(__tests__|coverage)/' },
        moduleSystems: ['cjs'],
    },
};
