import { describe, expect, it } from 'vitest'
import type { EffectAuditRecord } from '../model/types'
import { applyCostModifier, effectiveCostAtFrame } from './costModifier'

function costAudit(overrides: Partial<EffectAuditRecord> = {}): EffectAuditRecord {
  return {
    frame: 0,
    issuerId: 2,
    targetIds: [1],
    skillRef: { kind: 'ex' },
    effectIndex: 0,
    effectType: 'CostChange',
    action: 'applied',
    effectId: 1,
    value: -5000,
    valueType: 'Coefficient',
    ...overrides,
  }
}

describe('CostChange modifiers', () => {
  it.each([
    [3, 2],
    [5, 3],
    [6, 3],
  ])('truncates a 50%% reduction for %i Cost to %i Cost', (baseCost, expected) => {
    expect(applyCostModifier(baseCost, { amount: -5000, valueType: 'Coefficient' })).toBe(expected)
  })

  it('supports fixed reductions and never returns a negative Cost', () => {
    expect(applyCostModifier(5, { amount: -1, valueType: 'BaseAmount' })).toBe(4)
    expect(applyCostModifier(3, { amount: -4, valueType: 'BaseAmount' })).toBe(0)
  })

  it('keeps a modifier active for the EX that consumes it', () => {
    const records = [
      costAudit(),
      costAudit({ frame: 300, action: 'consumed', uses: 0 }),
    ]
    expect(effectiveCostAtFrame(records, 1, 300, 5)).toBe(3)
    expect(effectiveCostAtFrame(records, 1, 301, 5)).toBe(5)
  })

  it('uses the replacement modifier instead of stacking reductions', () => {
    const records = [
      costAudit({ value: -1, valueType: 'BaseAmount' }),
      costAudit({ frame: 100, action: 'replaced' }),
      costAudit({ frame: 100, effectId: 2, value: -5000, valueType: 'Coefficient' }),
    ]
    expect(effectiveCostAtFrame(records, 1, 100, 5)).toBe(3)
  })
})
