import type { NsSchedulingEligibility } from './nsSchedulingRules'
import type { CoverageEntry } from '../../../scripts/lib/ruleCoverage.mjs'
export function inspectNsScheduling(student: unknown, gearLevel: number, catalog: unknown): NsSchedulingEligibility
export function checkNsSchedulingRegistration(data: unknown, catalog: unknown): {
  errors: Array<{ path: string; message: string }>
  entries: CoverageEntry[]
}
