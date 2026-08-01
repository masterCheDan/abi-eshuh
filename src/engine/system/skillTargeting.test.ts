import { describe, expect, it } from 'vitest'
import { fixedSkillTargetIds, normalizedEffectTargets, skillRequiresManualTarget, skillTargetPolicy } from './skillTargeting'

describe('skill targeting', () => {
  it('infers enemy targets for unannotated offensive effects', () => {
    const effects = [{ Type: 'Damage' }, { Type: 'CrowdControl' }]
    expect(normalizedEffectTargets(effects[0])).toEqual(['Enemy'])
    expect(skillTargetPolicy(effects)).toBe('boss')
    expect(skillRequiresManualTarget(effects)).toBe(false)
  })

  it('keeps self-only NS/SS fixed to their caster', () => {
    const effects = [{ Type: 'Regen', Target: 'Self' }]
    expect(skillTargetPolicy(effects)).toBe('self')
    expect(fixedSkillTargetIds('self', 10005)).toEqual([10005])
  })

  it('does not turn a self buff plus omitted damage into a friendly selection', () => {
    const effects = [{ Type: 'Damage' }, { Type: 'Buff', Target: 'Self' }]
    expect(skillTargetPolicy(effects)).toBe('mixed')
    expect(fixedSkillTargetIds('mixed', 1)).toEqual([1, -1])
  })

  it('only allows manual selection for Ally and Any', () => {
    expect(skillTargetPolicy([{ Type: 'Buff', Target: 'AllyMain' }])).toBe('formation')
    expect(skillTargetPolicy([{ Type: 'Heal', Target: 'Ally' }])).toBe('select-ally')
    expect(skillTargetPolicy([{ Type: 'Shield', Target: 'Any' }])).toBe('select-any')
  })
})
