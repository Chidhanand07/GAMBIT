/**
 * S12 (NX-07): no debug-only route ships. `/api/debug/session` listed the caller's cookie
 * names and session details; diagnostics like that belong in local tooling, not in a
 * deployed endpoint. This scan fails if a debug/diagnostic route is added again.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP = path.join(__dirname, '..', '..', 'app')
const FORBIDDEN_SEGMENT = /^_?(debug|diagnostics?|internal|dev|test)$/i

function routeFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return routeFiles(full)
        return /^(route|page)\.tsx?$/.test(entry.name) ? [path.relative(APP, full)] : []
    })
}

test('there is no debug-only route or page', () => {
    const offenders = routeFiles(APP).filter((file) => file.split(path.sep).some((segment) => FORBIDDEN_SEGMENT.test(segment)))
    expect(offenders).toEqual([])
})

test('app/api/debug does not exist', () => {
    expect(fs.existsSync(path.join(APP, 'api', 'debug'))).toBe(false)
})
