#!/usr/bin/env node
'use strict';

/**
 * Dependency audit gate (SEC-11). No dependencies: Node built-ins only, and no node_modules needed
 * in the audited package (npm audits the lockfile).
 *
 *   node scripts/dependency-audit.js npm server
 *   node scripts/dependency-audit.js npm frontend
 *   node scripts/dependency-audit.js pip chess-engine     # needs `pip-audit` on PATH
 *   node scripts/dependency-audit.js check-allowlist      # validate the allow-list only
 *
 * What fails the run
 *   npm: every advisory of severity high or critical in the production tree
 *        (`npm audit --omit=dev --audit-level=high`), unless allow-listed.
 *   pip: EVERY known vulnerability (`pip-audit -r requirements.txt`), unless allow-listed.
 *        pip-audit reports no severity and has no severity filter, so "high/critical only" cannot be
 *        honoured honestly for Python. The gate is therefore stricter than SEC-11 asks: a low-severity
 *        Python advisory also fails, and needs either an upgrade or an allow-list entry.
 *   both: an audit that could not run or could not be parsed (fail closed, SEC-09), and an invalid
 *        or expired allow-list entry.
 *
 * Allow-list: .github/dependency-audit-allowlist.json
 *   { "exceptions": [ {
 *       "id": "GHSA-xxxx-xxxx-xxxx",     // advisory id as printed by this script (GHSA-, CVE- or PYSEC-)
 *       "scope": "server",               // server | frontend | chess-engine; one entry per package tree
 *       "reason": "why this is not exploitable here, or why the fix cannot ship yet",
 *       "approvedBy": "github-handle",   // who accepted the risk
 *       "expires": "2026-12-31"          // YYYY-MM-DD, at most 90 days ahead; after it the job fails again
 *   } ] }
 * Every field is required. An entry that matches nothing only warns, so remove it once the fix lands.
 *
 * Exit codes: 0 clean, 1 unapproved findings, 2 the audit or the allow-list is broken.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ALLOWLIST = path.join(REPO_ROOT, '.github', 'dependency-audit-allowlist.json');
const SCOPES = ['server', 'frontend', 'chess-engine'];
const FAILING_NPM_SEVERITIES = new Set(['high', 'critical']);
const ID_PATTERN = /^(GHSA(-[23456789cfghjmpqrvwx]{4}){3}|CVE-\d{4}-\d{4,}|PYSEC-\d{4}-\d+)$/i;
const MIN_REASON_LENGTH = 20;
const MAX_EXCEPTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

class AuditError extends Error {}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** Returns a list of problems; empty means the allow-list is valid. `today` is a YYYY-MM-DD string. */
function validateAllowlist(document, today) {
  const problems = [];
  const todayDate = parseDay(today);
  if (!todayDate) throw new AuditError(`invalid "today": ${today}`);
  if (!document || typeof document !== 'object' || !Array.isArray(document.exceptions)) {
    return ['the allow-list must be an object with an "exceptions" array'];
  }
  const seen = new Set();
  document.exceptions.forEach((entry, index) => {
    const label = `exceptions[${index}]${entry && entry.id ? ` (${entry.id})` : ''}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${label}: must be an object`);
      return;
    }
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      problems.push(`${label}: "id" must be a GHSA-, CVE- or PYSEC- advisory id`);
    }
    if (!SCOPES.includes(entry.scope)) {
      problems.push(`${label}: "scope" must be one of ${SCOPES.join(', ')}`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < MIN_REASON_LENGTH) {
      problems.push(`${label}: "reason" is required (at least ${MIN_REASON_LENGTH} characters)`);
    }
    if (typeof entry.approvedBy !== 'string' || entry.approvedBy.trim() === '') {
      problems.push(`${label}: "approvedBy" is required`);
    }
    const expires = parseDay(entry.expires);
    if (!expires) {
      problems.push(`${label}: "expires" is required, as YYYY-MM-DD`);
    } else if (expires < todayDate) {
      problems.push(`${label}: expired on ${entry.expires}; fix the dependency or renew the exception`);
    } else if (expires - todayDate > MAX_EXCEPTION_DAYS * DAY_MS) {
      problems.push(`${label}: "expires" is more than ${MAX_EXCEPTION_DAYS} days ahead`);
    }
    const key = `${String(entry.scope)}|${String(entry.id).toUpperCase()}`;
    if (seen.has(key)) problems.push(`${label}: duplicate entry for scope ${entry.scope}`);
    seen.add(key);
  });
  return problems;
}

/**
 * `npm audit --json` (auditReportVersion 2) -> one finding per high/critical advisory.
 * Advisories are the object items of each package's `via`; string items only name another package.
 */
function collectNpmFindings(report) {
  if (!report || typeof report !== 'object') throw new AuditError('npm audit printed no JSON report');
  if (report.error) {
    const detail = report.error.summary || report.error.code || JSON.stringify(report.error);
    throw new AuditError(`npm audit failed: ${detail}`);
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new AuditError('npm audit report has no "vulnerabilities" object (unexpected format)');
  }
  const findings = new Map();
  for (const [packageName, entry] of Object.entries(report.vulnerabilities)) {
    for (const via of Array.isArray(entry.via) ? entry.via : []) {
      if (!via || typeof via !== 'object') continue;
      const severity = String(via.severity || '').toLowerCase();
      if (!FAILING_NPM_SEVERITIES.has(severity)) continue;
      const match = /GHSA(-[0-9a-z]{4}){3}/i.exec(String(via.url || ''));
      // No GHSA id in the URL: keep the finding under a synthetic id that cannot be allow-listed.
      const id = match ? match[0] : `npm-advisory-${via.source}`;
      const key = `${id.toUpperCase()}|${via.name || packageName}`;
      if (findings.has(key)) continue;
      findings.set(key, {
        ids: [id],
        package: via.name || packageName,
        severity,
        title: via.title || '',
        url: via.url || '',
        detail: via.range ? `affected: ${via.range}` : '',
      });
    }
  }
  return [...findings.values()];
}

/** `pip-audit --format json` -> one finding per vulnerability, plus the dependencies it skipped. */
function collectPipFindings(report) {
  const dependencies = Array.isArray(report) ? report : report && report.dependencies;
  if (!Array.isArray(dependencies)) {
    throw new AuditError('pip-audit report has no "dependencies" array (unexpected format)');
  }
  const findings = [];
  const skipped = [];
  for (const dependency of dependencies) {
    if (dependency.skip_reason) {
      skipped.push(`${dependency.name}: ${dependency.skip_reason}`);
      continue;
    }
    for (const vuln of dependency.vulns || []) {
      findings.push({
        ids: [vuln.id, ...(vuln.aliases || [])].filter(Boolean),
        package: `${dependency.name}==${dependency.version}`,
        severity: 'unrated',
        title: '',
        url: '',
        detail: (vuln.fix_versions || []).length
          ? `fixed in: ${vuln.fix_versions.join(', ')}`
          : 'no fixed version published',
      });
    }
  }
  return { findings, skipped };
}

/** Splits findings into blocking and approved, and reports the entries of this scope that matched nothing. */
function applyAllowlist(findings, exceptions, scope) {
  const scoped = exceptions.filter((entry) => entry.scope === scope);
  const used = new Set();
  const blocking = [];
  const approved = [];
  for (const finding of findings) {
    const ids = finding.ids.map((id) => id.toUpperCase());
    const entry = scoped.find((candidate) => ids.includes(candidate.id.toUpperCase()));
    if (entry) {
      used.add(entry);
      approved.push({ finding, entry });
    } else {
      blocking.push(finding);
    }
  }
  return { blocking, approved, unused: scoped.filter((entry) => !used.has(entry)) };
}

function loadAllowlist(file, today) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new AuditError(`cannot read the allow-list ${file}: ${error.message}`);
  }
  const problems = validateAllowlist(document, today);
  if (problems.length) {
    throw new AuditError(`invalid allow-list ${file}:\n  - ${problems.join('\n  - ')}`);
  }
  return document.exceptions;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new AuditError(`cannot run ${command}: ${result.error.message}`);
  return result;
}

function parseJsonOutput(tool, result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    const stderr = (result.stderr || '').trim().split('\n').slice(-15).join('\n');
    throw new AuditError(`${tool} exited ${result.status} without a JSON report.\n${stderr}`);
  }
}

function auditNpm(directory) {
  // --package-lock-only: audit the committed lockfile; node_modules is not needed.
  const result = run(
    'npm',
    ['audit', '--omit=dev', '--audit-level=high', '--package-lock-only', '--json'],
    directory,
  );
  return { findings: collectNpmFindings(parseJsonOutput('npm audit', result)), skipped: [] };
}

function auditPip(directory) {
  const result = run(
    'pip-audit',
    ['-r', 'requirements.txt', '--format', 'json', '--progress-spinner', 'off'],
    directory,
  );
  // pip-audit exits 1 when it finds vulnerabilities; any other failure leaves no JSON on stdout.
  return collectPipFindings(parseJsonOutput('pip-audit', result));
}

const inActions = process.env.GITHUB_ACTIONS === 'true';
const oneLine = (text) => String(text).replace(/\r?\n/g, ' ');
function annotate(level, title, message) {
  if (inActions) console.log(`::${level} title=${oneLine(title)}::${oneLine(message)}`);
}

function describe(finding) {
  const parts = [finding.severity.toUpperCase().padEnd(8), finding.ids[0], finding.package];
  if (finding.title) parts.push(`- ${finding.title}`);
  if (finding.detail) parts.push(`(${finding.detail})`);
  if (finding.url) parts.push(finding.url);
  return parts.join(' ');
}

function main(argv) {
  const today = new Date().toISOString().slice(0, 10);
  const allowlistFile = process.env.DEPENDENCY_AUDIT_ALLOWLIST || DEFAULT_ALLOWLIST;
  const [mode, scope] = argv;

  if (mode === 'check-allowlist') {
    const exceptions = loadAllowlist(allowlistFile, today);
    console.log(`Allow-list is valid: ${exceptions.length} exception(s).`);
    return 0;
  }
  if (!['npm', 'pip'].includes(mode) || !SCOPES.includes(scope)) {
    console.error('usage: dependency-audit.js <npm|pip> <server|frontend|chess-engine> | check-allowlist');
    return 2;
  }

  const exceptions = loadAllowlist(allowlistFile, today);
  const directory = path.join(REPO_ROOT, scope);
  const { findings, skipped } = mode === 'npm' ? auditNpm(directory) : auditPip(directory);
  const { blocking, approved, unused } = applyAllowlist(findings, exceptions, scope);
  const threshold = mode === 'npm' ? 'high/critical advisories' : 'known vulnerabilities (any severity)';

  console.log(`Dependency audit: ${scope} (${mode}), failing on ${threshold}`);
  for (const line of skipped) {
    console.log(`  NOT AUDITED ${line}`);
    annotate('warning', `Dependency audit (${scope}): not audited`, line);
  }
  for (const { finding, entry } of approved) {
    console.log(`  APPROVED until ${entry.expires} by ${entry.approvedBy}: ${describe(finding)}`);
    console.log(`           reason: ${entry.reason}`);
  }
  for (const entry of unused) {
    const message = `${entry.id} (${scope}) matches no current finding; remove it from the allow-list`;
    console.log(`  UNUSED EXCEPTION ${message}`);
    annotate('warning', 'Dependency audit: unused exception', message);
  }
  for (const finding of blocking) {
    console.log(`  BLOCKING ${describe(finding)}`);
    annotate('error', `Dependency audit (${scope}): ${finding.ids[0]}`, describe(finding));
  }
  if (blocking.length) {
    console.log(
      `\nFAILED: ${blocking.length} unapproved finding(s) in ${scope}. Upgrade the dependency, or add an ` +
        'approved exception with a reason to .github/dependency-audit-allowlist.json (SEC-11).',
    );
    return 1;
  }
  console.log(`\nOK: no unapproved findings in ${scope} (${approved.length} approved exception(s)).`);
  return 0;
}

module.exports = { validateAllowlist, collectNpmFindings, collectPipFindings, applyAllowlist, AuditError };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof AuditError)) throw error;
    console.error(`ERROR: ${error.message}`);
    annotate('error', 'Dependency audit could not run', error.message);
    process.exitCode = 2;
  }
}
