import { describe, expect, it } from 'vitest'
import { rules } from '../../domain/rules/GameRules'

describe('skill targeting', () => {
  it('infers enemy targets for unannotated offensive effects', () => {
    const effects = [{ Type: 'Damage' }, { Type: 'CrowdControl' }]
    expect(rules.targeting.normalizedTargets(effects[0])).toEqual(['Enemy'])
    expect(rules.targeting.policy(effects)).toBe('boss')
    expect(rules.targeting.requiresManualTarget(effects)).toBe(false)
  })

  it('keeps self-only NS/SS fixed to their caster', () => {
    const effects = [{ Type: 'Regen', Target: 'Self' }]
    expect(rules.targeting.policy(effects)).toBe('self')
    expect(rules.targeting.fixedTargetIds('self', 10005)).toEqual([10005])
  })

  it('does not turn a self buff plus omitted damage into a friendly selection', () => {
    const effects = [{ Type: 'Damage' }, { Type: 'Buff', Target: 'Self' }]
    expect(rules.targeting.policy(effects)).toBe('mixed')
    expect(rules.targeting.fixedTargetIds('mixed', 1)).toEqual([1, -1])
  })

  it('only allows manual selection for Ally and Any', () => {
    expect(rules.targeting.policy([{ Type: 'Buff', Target: 'AllyMain' }])).toBe('formation')
    expect(rules.targeting.policy([{ Type: 'Heal', Target: 'Ally' }])).toBe('select-ally')
    expect(rules.targeting.policy([{ Type: 'Shield', Target: 'Any' }])).toBe('select-any')
  })
})
