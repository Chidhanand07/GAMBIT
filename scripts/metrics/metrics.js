#!/usr/bin/env node
/**
 * Code-size and complexity metrics for the GAMBIT monorepo.
 *
 * Usage (from the repo root, after `npm ci` in frontend/):
 *   node scripts/metrics/metrics.js "Baseline" > docs/refactor/BASELINE.md
 *
 * JS/TS files are parsed with the TypeScript compiler API (resolved from
 * frontend/node_modules); Python files are handed to py_metrics.py.
 *
 * Per file: physical lines, longest function (lines), highest cyclomatic
 * complexity of any function, and (TS only) the number of explicit `any`.
 * Complexity follows ESLint's classic counting: 1 + if, ?:, loops, case,
 * catch, &&, ||, ??, default parameters. Nested functions are measured on
 * their own and do not add to their parent.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ts = require(require.resolve('typescript', { paths: [path.join(ROOT, 'frontend')] }));

const LIMITS = { fileLines: 300, functionLines: 60, complexity: 10 };
const IGNORED_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', '.venv', 'venv', 'tests', 'coverage']);

const PACKAGES = [
    { name: 'server', dir: 'server', exts: ['.js'] },
    { name: 'frontend', dir: 'frontend', exts: ['.ts', '.tsx'], only: ['app', 'components', 'lib', 'features', 'types', 'middleware.ts'] },
    { name: 'chess-engine', dir: 'chess-engine', exts: ['.py'] },
];

function listFiles(dir, exts) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFiles(full, exts));
        else if (exts.includes(path.extname(entry.name)) && !/\.(test|config)\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
    }
    return out;
}

function packageFiles(pkg) {
    const base = path.join(ROOT, pkg.dir);
    if (!pkg.only) return listFiles(base, pkg.exts);
    return pkg.only.flatMap((p) => {
        const full = path.join(base, p);
        if (!fs.existsSync(full)) return [];
        return fs.statSync(full).isDirectory() ? listFiles(full, pkg.exts) : [full];
    });
}

const K = ts.SyntaxKind;
const FUNCTION_KINDS = new Set([
    K.FunctionDeclaration, K.FunctionExpression, K.ArrowFunction, K.MethodDeclaration,
    K.Constructor, K.GetAccessor, K.SetAccessor,
]);
const BRANCH_KINDS = new Set([
    K.IfStatement, K.ConditionalExpression, K.ForStatement, K.ForInStatement, K.ForOfStatement,
    K.WhileStatement, K.DoStatement, K.CatchClause,
]);
const LOGICAL_OPERATORS = new Set([K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken]);

function functionName(node) {
    if (node.name && node.name.getText) return node.name.getText();
    const parent = node.parent;
    if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name) return parent.name.getText();
    if (parent && ts.isCallExpression(parent)) return `<callback of ${parent.expression.getText().slice(0, 40)}>`;
    return '<anonymous>';
}

function complexityOf(fn) {
    let score = 1;
    const visit = (node) => {
        if (node !== fn && FUNCTION_KINDS.has(node.kind)) return; // measured separately
        if (BRANCH_KINDS.has(node.kind)) score += 1;
        else if (node.kind === K.CaseClause) score += 1;
        else if (node.kind === K.BinaryExpression && LOGICAL_OPERATORS.has(node.operatorToken.kind)) score += 1;
        else if (node.kind === K.Parameter && node.initializer) score += 1;
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(fn, visit);
    return score;
}

function analyseTsFile(file) {
    const text = fs.readFileSync(file, 'utf8');
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const lineOf = (pos) => source.getLineAndCharacterOfPosition(pos).line;
    const result = { lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), functions: [], anyCount: 0 };
    const visit = (node) => {
        if (node.kind === K.AnyKeyword) result.anyCount += 1;
        if (FUNCTION_KINDS.has(node.kind) && node.body) {
            result.functions.push({
                name: functionName(node),
                line: lineOf(node.getStart()) + 1,
                lines: lineOf(node.getEnd()) - lineOf(node.getStart()) + 1,
                complexity: complexityOf(node),
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return result;
}

function analysePythonFiles(files) {
    if (!files.length) return {};
    const python = process.env.PYTHON || 'python3';
    const out = execFileSync(python, [path.join(__dirname, 'py_metrics.py'), ...files], { encoding: 'utf8' });
    return JSON.parse(out);
}

function summarise(file, data) {
    const longest = data.functions.reduce((a, f) => (f.lines > (a?.lines ?? 0) ? f : a), null);
    const complex = data.functions.reduce((a, f) => (f.complexity > (a?.complexity ?? 0) ? f : a), null);
    return {
        file: path.relative(ROOT, file),
        lines: data.lines,
        longest,
        complex,
        anyCount: data.anyCount ?? 0,
        overLongFunctions: data.functions.filter((f) => f.lines > LIMITS.functionLines).length,
        overComplexFunctions: data.functions.filter((f) => f.complexity > LIMITS.complexity).length,
    };
}

function collect() {
    return PACKAGES.map((pkg) => {
        const files = packageFiles(pkg);
        const raw = pkg.exts.includes('.py')
            ? analysePythonFiles(files)
            : Object.fromEntries(files.map((f) => [f, analyseTsFile(f)]));
        const rows = files.map((f) => summarise(f, raw[f])).sort((a, b) => b.lines - a.lines);
        return { pkg, rows };
    });
}

function fmtFn(f, key) {
    return f ? `${f[key]} (\`${f.name}\` L${f.line})` : '–';
}

function render(title, packages) {
    const out = [`# ${title} metrics`, '', `Generated by \`node scripts/metrics/metrics.js\` on ${new Date().toISOString().slice(0, 10)}.`, ''];
    out.push(`Limits (docs/ENGINEERING_RULES.md SIZE-01..03): file ≤ ${LIMITS.fileLines} lines, function ≤ ${LIMITS.functionLines} lines, complexity ≤ ${LIMITS.complexity}.`, '');
    out.push('## Summary', '', '| Package | Files | Total lines | Files > 300 lines | Functions > 60 lines | Functions complexity > 10 | Largest file | Longest function | Max complexity | Explicit `any` |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const { pkg, rows } of packages) {
        const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
        const maxBy = (k) => rows.reduce((a, r) => (r[k] && r[k][k === 'longest' ? 'lines' : 'complexity'] > (a?.[k === 'longest' ? 'lines' : 'complexity'] ?? 0) ? r[k] : a), null);
        const longest = maxBy('longest');
        const complex = maxBy('complex');
        out.push(`| ${pkg.name} | ${rows.length} | ${sum('lines')} | ${rows.filter((r) => r.lines > LIMITS.fileLines).length} | ${sum('overLongFunctions')} | ${sum('overComplexFunctions')} | ${rows[0] ? `${rows[0].lines} (${rows[0].file})` : '–'} | ${longest ? longest.lines : '–'} | ${complex ? complex.complexity : '–'} | ${pkg.exts.includes('.py') ? 'n/a' : sum('anyCount')} |`);
    }
    for (const { pkg, rows } of packages) {
        out.push('', `## ${pkg.name}`, '', '| File | Lines | Longest function | Max complexity | `any` |', '|---|---|---|---|---|');
        for (const r of rows) {
            out.push(`| ${r.file} | ${r.lines} | ${fmtFn(r.longest, 'lines')} | ${fmtFn(r.complex, 'complexity')} | ${pkg.exts.includes('.py') ? '–' : r.anyCount} |`);
        }
    }
    return out.join('\n') + '\n';
}

process.stdout.write(render(process.argv[2] || 'Baseline', collect()));
