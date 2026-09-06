import type { SkillEffect } from '../../types/student'

/** The data omits Target for effects whose target is implied by their type. */
const ENEMY_DEFAULT_EFFECTS = new Set([
  'Damage', 'DamageDebuff', 'CrowdControl', 'Knockback', 'Accumulation', 'ConcentratedTarget',
])

export type SkillTargetPolicy = 'self' | 'boss' | 'formation' | 'mixed' | 'select-ally' | 'select-any'

export function normalizedEffectTargets(effect: SkillEffect): string[] {
  if (effect.Target != null) return Array.isArray(effect.Target) ? effect.Target : [effect.Target]
  if (effect.Type === 'Summon') return ['Self']
  return ENEMY_DEFAULT_EFFECTS.has(effect.Type) ? ['Enemy'] : []
}

/**
 * Distinguishes targets fixed by skill data from targets that must be supplied
 * as a player fact. AllyMain/AllySupport are formation-wide fixed selectors.
 */
export function skillTargetPolicy(effects: SkillEffect[]): SkillTargetPolicy {
  const selectors = effects.flatMap(normalizedEffectTargets)
  if (!selectors.length || selectors.every(selector => selector === 'Self')) return 'self'
  if (selectors.includes('Any')) return 'select-any'
  if (selectors.includes('Ally')) return 'select-ally'
  if (selectors.every(selector => selector === 'Enemy')) return 'boss'
  if (selectors.every(selector => selector === 'Self' || selector === 'AllyMain' || selector === 'AllySupport')) return 'formation'
  return 'mixed'
}

/** Canonical event targets for a skill whose targets are not user-selectable. */
export function fixedSkillTargetIds(policy: Exclude<SkillTargetPolicy, 'select-ally' | 'select-any'>, issuerId: number): number[] {
  if (policy === 'boss') return [-1]
  if (policy === 'mixed') return [issuerId, -1]
  return [issuerId]
}

export function skillRequiresManualTarget(effects: SkillEffect[]): boolean {
  const policy = skillTargetPolicy(effects)
  return policy === 'select-ally' || policy === 'select-any'
}
