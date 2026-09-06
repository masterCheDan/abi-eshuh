export interface ActionDiagnostic {
  path: string
  code: string
  message: string
  severity: 'error' | 'blocker'
}
export interface ActionDataInspection {
  version: number
  studentId: number
  scope: 'student_data_only'
  automaticEligible: false
  variants: Array<{ path: string; ammoCapacity: number; ammoCost: number }>
  diagnostics: ActionDiagnostic[]
}
export function validateActionCatalog(catalog: unknown): Array<{ path: string; message: string }>
export function inspectActionData(student: unknown, catalog: unknown): ActionDataInspection
