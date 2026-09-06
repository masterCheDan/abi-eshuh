import type { Student } from '../../types/student'
import type { SkillRef } from '../types'
import { catalog } from './catalog'
import { inspectNsScheduling } from './nsSchedulingData.mjs'

export interface NsSchedulingConfig {
  enabled: boolean
  ruleVersion: number
  nsModes: Array<'manual' | 'automatic'>
}
export interface NsSchedulingEligibility {
  eligible: boolean
  skillRef: SkillRef
  periodFrames?: number
  reasons: string[]
}

/** Explicit inputs only; unknown versions cannot silently change replay semantics. */
export function validateNsSchedulingConfig(config: NsSchedulingConfig | undefined, slots: readonly (number | null)[]): void {
  if (config === undefined) return
  if (!config || typeof config.enabled !== 'boolean' || config.ruleVersion !== catalog.nsScheduling.version
    || !Array.isArray(config.nsModes) || config.nsModes.length !== slots.length
    || Array.from(config.nsModes).some((mode, slot) => !['manual', 'automatic'].includes(mode) || slots[slot] == null && mode !== 'manual')) {
    throw new Error('INVALID_SCHEDULING_CONFIG: 调度版本或逐槽位模式非法')
  }
}

export function nsSchedulingEligibility(student: Student, gearLevel: number): NsSchedulingEligibility {
  return inspectNsScheduling(student, gearLevel, catalog)
}
