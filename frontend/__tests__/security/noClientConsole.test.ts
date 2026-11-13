/**
 * S14 (SEC-01): code that runs in the browser does not write to the console. The sign-up flow
 * used to log the e-mail address, the session expiry and the auth cookie names there.
 * ESLint enforces this (`no-console` in eslint.config.mjs); this scan fails the test suite too,
 * and pins the list of exceptions so it can only shrink.
 *
 * Server-only code (route handlers, lib/server, proxy.ts) may log errors and warnings: those
 * go to the server log, not to a browser.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..')
const SCANNED = ['app', 'components', 'features', 'lib', 'types', 'proxy.ts']

/** Runs on the server only. Keep in step with `serverOnlyFiles` in eslint.config.mjs. */
const isServerOnly = (file: string) =>
    file.startsWith('lib/server/') || file.startsWith('app/api/') || /(^|\/)route\.ts$/.test(file) || file === 'proxy.ts'

/**
 * Client files that still call console and could not be changed with S14 (owned by another
 * change in flight). Remove an entry when its file is cleaned; never add one.
 */
// Empty: the last two offenders were cleaned on the branch that owns them. Keep it empty.
const KNOWN_CLIENT_OFFENDERS: string[] = []

const CONSOLE_USE = /\bconsole\s*(\.|\[|\?\.)/
const SERVER_ALLOWED = /\bconsole\s*\.\s*(error|warn)\s*\(/g

function sourceFiles(entry: string): string[] {
    const full = path.join(ROOT, entry)
    if (!fs.existsSync(full)) return []
    if (fs.statSync(full).isFile()) return [entry]
    return fs.readdirSync(full).flatMap((name) => {
        const child = path.posix.join(entry, name)
        if (fs.statSync(path.join(ROOT, child)).isDirectory()) return sourceFiles(child)
        return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [child] : []
    })
}

/** Source text without block and line comments (a comment may mention the console). */
function code(file: string): string {
    return fs
        .readFileSync(path.join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const files = SCANNED.flatMap(sourceFiles)
const usesConsole = (file: string) => CONSOLE_USE.test(code(file))

test('the scan sees the client code', () => {
    expect(files).toEqual(expect.arrayContaining(['features/auth/signup.ts', 'app/signup/page.tsx', 'lib/api/invite.ts']))
})

test('no client code calls console', () => {
    const offenders = files.filter((file) => !isServerOnly(file) && usesConsole(file))
    expect(offenders.filter((file) => !KNOWN_CLIENT_OFFENDERS.includes(file))).toEqual([])
})

test('the exception list only holds files that still call console', () => {
    expect(KNOWN_CLIENT_OFFENDERS.filter((file) => !usesConsole(file))).toEqual([])
})

test('server-only code uses console.error / console.warn only', () => {
    const offenders = files.filter((file) => isServerOnly(file) && CONSOLE_USE.test(code(file).replace(SERVER_ALLOWED, '')))
    expect(offenders).toEqual([])
})

test('the scan recognises a console call and ignores a comment', () => {
    expect(CONSOLE_USE.test('console.log(1)')).toBe(true)
    expect(CONSOLE_USE.test("console['log'](1)")).toBe(true)
    expect(CONSOLE_USE.test('const consoleLike = 1')).toBe(false)
})
