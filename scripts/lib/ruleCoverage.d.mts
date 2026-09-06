export interface CoverageEntry { path: string; ruleId: string; status: string; strategy: string; limitations?: string }
import type { ActionDataInspection } from '../../src/domain/rules/actionData.mjs'
export interface CoverageReport {
  version: number; ok: boolean; counts: Record<string, number>; entries: CoverageEntry[]
  errors: Array<{ path: string; message: string }>
  actions: { version: number; scope: string; eligible: number; blocked: number; students: ActionDataInspection[] }
}
export function checkCoverage(data: unknown, catalog: unknown, bindings?: Record<string, unknown>): CoverageReport
export function formatCoverage(report: CoverageReport): string
