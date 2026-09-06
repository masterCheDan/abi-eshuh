import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkCoverage, formatCoverage } from './lib/ruleCoverage.mjs'

const root = new URL('../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const report = checkCoverage(read('src/data/students.min.json'), read('src/domain/rules/catalog.json'))
// Load real TS handlers using the existing runner, selecting only the binding test.
// Keep CLI verification limited to bindings; the complete test suite has its own CI step.
const binding = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/vitest/vitest.mjs', root)), 'run', 'src/domain/rules/catalogBindings.test.ts', '--reporter=json'], {
  cwd: fileURLToPath(root), encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
})
if (binding.error || binding.status !== 0) {
  report.ok = false
  report.errors.push({ path: 'runtime.bindings', message: 'Runtime binding verification failed: ' + (binding.error?.message ?? binding.stderr ?? '') + '\n' + (binding.stdout ?? '') })
}
console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatCoverage(report))
process.exitCode = report.ok ? 0 : 1
