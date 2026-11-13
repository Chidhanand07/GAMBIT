/**
 * NX-14: a production build must not hide type or lint errors. `next build` type-checks;
 * ESLint and `tsc --noEmit` stay separate CI gates; `tsconfig` is strict.
 */
import fs from 'node:fs'
import path from 'node:path'
import tsconfig from '../../tsconfig.json'

const ROOT = path.join(__dirname, '..', '..')
// next.config.js is CommonJS.
const nextConfig = require('../../next.config.js') as Record<string, unknown>
const workflow = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'tests.yml'), 'utf8')
const frontendJob = workflow.slice(workflow.indexOf('\n  frontend:'), workflow.indexOf('\n  engine:'))

test('next.config does not ignore TypeScript errors during builds', () => {
    const typescript = nextConfig.typescript as { ignoreBuildErrors?: boolean } | undefined
    expect(typescript?.ignoreBuildErrors ?? false).toBe(false)
})

test('next.config has no eslint.ignoreDuringBuilds (and no eslint key, which Next 16 rejects)', () => {
    expect(nextConfig).not.toHaveProperty('eslint')
    expect(fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8')).not.toMatch(/ignoreBuildErrors|ignoreDuringBuilds/)
})

test('tsconfig is strict', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true)
})

test('CI runs the type check, ESLint and a production build as separate steps', () => {
    expect(frontendJob).toMatch(/run: npm run typecheck/)
    expect(frontendJob).toMatch(/run: npm run lint\b/)
    expect(frontendJob).toMatch(/run: npm run build/)
})
