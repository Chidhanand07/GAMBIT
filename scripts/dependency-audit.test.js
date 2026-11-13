'use strict';

// Run with: node --test scripts/dependency-audit.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const {
  validateAllowlist,
  collectNpmFindings,
  collectPipFindings,
  applyAllowlist,
  AuditError,
} = require('./dependency-audit');

const TODAY = '2026-11-12';
const entry = (overrides = {}) => ({
  id: 'GHSA-3h5v-q93c-6h6q',
  scope: 'server',
  reason: 'Only reachable through a code path the server never calls.',
  approvedBy: 'owner',
  expires: '2026-12-01',
  ...overrides,
});

const npmReport = {
  auditReportVersion: 2,
  vulnerabilities: {
    ws: {
      name: 'ws',
      severity: 'high',
      via: [
        {
          source: 1098392,
          name: 'ws',
          title: 'ws affected by a DoS',
          url: 'https://github.com/advisories/GHSA-3h5v-q93c-6h6q',
          severity: 'high',
          range: '>=8.0.0 <8.17.1',
        },
      ],
    },
    'engine.io': { name: 'engine.io', severity: 'high', via: ['ws'] },
    cookie: {
      name: 'cookie',
      severity: 'low',
      via: [
        {
          source: 1,
          name: 'cookie',
          title: 'low one',
          url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x',
          severity: 'low',
        },
      ],
    },
    axios: {
      name: 'axios',
      severity: 'critical',
      via: [
        {
          source: 2,
          name: 'axios',
          title: 'critical one',
          url: 'https://github.com/advisories/GHSA-jr5f-v2jv-69x6',
          severity: 'critical',
        },
      ],
    },
  },
};

test('the committed allow-list is valid', () => {
  const file = path.join(__dirname, '..', '.github', 'dependency-audit-allowlist.json');
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(validateAllowlist(JSON.parse(fs.readFileSync(file, 'utf8')), today), []);
});

test('a complete exception is accepted', () => {
  assert.deepEqual(validateAllowlist({ exceptions: [entry()] }, TODAY), []);
});

test('an exception needs an id, a scope, a reason, an approver and an expiry', () => {
  for (const field of ['id', 'scope', 'reason', 'approvedBy', 'expires']) {
    const broken = entry();
    delete broken[field];
    const problems = validateAllowlist({ exceptions: [broken] }, TODAY);
    assert.equal(problems.length, 1, field);
    assert.match(problems[0], new RegExp(`"${field}"`));
  }
});

test('a token reason, an unknown scope and a malformed id are rejected', () => {
  assert.equal(validateAllowlist({ exceptions: [entry({ reason: 'wontfix' })] }, TODAY).length, 1);
  assert.equal(validateAllowlist({ exceptions: [entry({ scope: 'all' })] }, TODAY).length, 1);
  assert.equal(validateAllowlist({ exceptions: [entry({ id: 'ws' })] }, TODAY).length, 1);
  assert.equal(validateAllowlist({ exceptions: [entry({ id: '*' })] }, TODAY).length, 1);
});

test('an expired, far-future or impossible expiry is rejected; today is still valid', () => {
  assert.match(validateAllowlist({ exceptions: [entry({ expires: '2026-11-11' })] }, TODAY)[0], /expired/);
  assert.match(validateAllowlist({ exceptions: [entry({ expires: '2027-06-01' })] }, TODAY)[0], /90 days/);
  assert.equal(validateAllowlist({ exceptions: [entry({ expires: '2026-02-30' })] }, TODAY).length, 1);
  assert.deepEqual(validateAllowlist({ exceptions: [entry({ expires: TODAY })] }, TODAY), []);
});

test('duplicates and a malformed document are rejected', () => {
  assert.equal(validateAllowlist({ exceptions: [entry(), entry()] }, TODAY).length, 1);
  assert.equal(validateAllowlist([], TODAY).length, 1);
  assert.equal(validateAllowlist({ exceptions: [null] }, TODAY).length, 1);
});

test('npm: only high and critical advisories are findings, once each', () => {
  const findings = collectNpmFindings(npmReport);
  assert.deepEqual(findings.map((finding) => finding.ids[0]).sort(), [
    'GHSA-3h5v-q93c-6h6q',
    'GHSA-jr5f-v2jv-69x6',
  ]);
  assert.equal(findings.find((finding) => finding.package === 'ws').severity, 'high');
});

test('npm: a clean report has no findings', () => {
  assert.deepEqual(collectNpmFindings({ auditReportVersion: 2, vulnerabilities: {} }), []);
});

test('npm: an error report or an unknown format fails closed', () => {
  assert.throws(() => collectNpmFindings({ error: { code: 'ENOLOCK', summary: 'no lockfile' } }), AuditError);
  assert.throws(() => collectNpmFindings({}), AuditError);
  assert.throws(() => collectNpmFindings(null), AuditError);
});

test('pip: every vulnerability is a finding and skipped dependencies are reported', () => {
  const { findings, skipped } = collectPipFindings({
    dependencies: [
      { name: 'uvicorn', version: '0.24.0', vulns: [] },
      {
        name: 'fastapi',
        version: '0.104.1',
        vulns: [{ id: 'PYSEC-2024-38', fix_versions: ['0.109.1'], aliases: ['CVE-2024-24762'] }],
      },
      { name: 'torch', skip_reason: 'Dependency not found on PyPI and could not be audited' },
    ],
    fixes: [],
  });
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].ids, ['PYSEC-2024-38', 'CVE-2024-24762']);
  assert.equal(findings[0].package, 'fastapi==0.104.1');
  assert.equal(skipped.length, 1);
  assert.throws(() => collectPipFindings({}), AuditError);
});

test('an exception approves only its own advisory in its own scope', () => {
  const findings = collectNpmFindings(npmReport);
  const exceptions = [entry(), entry({ id: 'GHSA-jr5f-v2jv-69x6', scope: 'frontend' })];

  const server = applyAllowlist(findings, exceptions, 'server');
  assert.deepEqual(server.blocking.map((finding) => finding.ids[0]), ['GHSA-jr5f-v2jv-69x6']);
  assert.equal(server.approved.length, 1);
  assert.deepEqual(server.unused, []);

  const frontend = applyAllowlist(findings, exceptions, 'frontend');
  assert.deepEqual(frontend.blocking.map((finding) => finding.ids[0]), ['GHSA-3h5v-q93c-6h6q']);
});

test('a pip exception may name an alias; an unmatched exception is reported as unused', () => {
  const { findings } = collectPipFindings({
    dependencies: [
      { name: 'fastapi', version: '0.104.1', vulns: [{ id: 'PYSEC-2024-38', aliases: ['CVE-2024-24762'] }] },
    ],
  });
  const exceptions = [
    entry({ id: 'cve-2024-24762', scope: 'chess-engine' }),
    entry({ id: 'PYSEC-2020-1', scope: 'chess-engine' }),
  ];
  const result = applyAllowlist(findings, exceptions, 'chess-engine');
  assert.deepEqual(result.blocking, []);
  assert.equal(result.unused.length, 1);
  assert.equal(result.unused[0].id, 'PYSEC-2020-1');
});
