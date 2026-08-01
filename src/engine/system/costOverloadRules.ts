import type { SkillEffect } from '../../types/student'
import type { SkillRef } from '../model/types'

/**
 * Versioned EX rules missing from structured student Effects data.
 * Runtime code must not parse Desc to discover CostOverload.
 */
export interface CostOverloadRule {
  borrowLimit: number
  applyFrame: number
  durationMs: number
  /** Existing source effects that actually target the selected ally. */
  selectedTargetEffectIndices: readonly number[]
}

export const COST_OVERLOAD_RULES: Readonly<Record<number, CostOverloadRule>> = {
  20048: {
    borrowLimit: 5,
    applyFrame: 81,
    durationMs: 26_000,
    selectedTargetEffectIndices: [0],
  },
}

export function applyCostOverloadRule(
  studentId: number,
  ref: SkillRef,
  effects: readonly SkillEffect[],
): SkillEffect[] {
  const rule = ref.kind === 'ex' ? COST_OVERLOAD_RULES[studentId] : undefined
  if (!rule) return [...effects]
  const selected = new Set(rule.selectedTargetEffectIndices)
  return [
    ...effects.map((effect, index) => selected.has(index) ? { ...effect, Target: 'Ally' } : effect),
    {
      Type: 'Special',
      Target: 'Ally',
      Key: 'CostOverload',
      Scale: [rule.borrowLimit],
      ApplyFrame: rule.applyFrame,
      Duration: rule.durationMs,
    },
  ]
}

/** Coverage-only marker; simulation code never reads descriptions. */
export const COST_OVERLOAD_DESCRIPTION_PATTERN = /<b:CostOverload>/

