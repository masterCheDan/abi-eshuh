import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../core/simulationEngine'
import type { Intent, SimulationError } from '../model/types'
import { baselineBattle, baselineEx } from './fixtures'

describe('baseline: rejected events have no simulation side effects', () => {
  it('rejects an EX during active control without spending Cost or consuming a card', () => {
    const battle = baselineBattle()
    battle.students.get(900002)!.Skills.P.Effects = [{ Type: 'CrowdControl', Target: 'Ally', Duration: 1_000 }]
    const control: Intent = { ...baselineEx('control', 400, 900002), type: 'NS_TRIGGER', skillRef: { kind: 'public' }, priority: 2, targetIds: [900001] }
    const reference = new SimulationEngine().simulateInput({ ...battle, intents: [control] })
    const result = new SimulationEngine().simulateInput({ ...battle, intents: [control, baselineEx('during-control', 401)] })
    expect(reference.errors).toEqual([])
    expect(reference.effectAudit).toContainEqual(expect.objectContaining({ frame: 400, targetIds: [900001], effectType: 'CrowdControl', action: 'applied', expiresAt: 430 }))
    expect(result.errors).toHaveLength(1)
    expect({ ...result, errors: [] }).toEqual(reference)
  })

  const cases: Array<{ name: string; error: SimulationError['type']; frame: number; count?: number }> = [
    { name: 'invalid target', error: 'INVALID_TARGET', frame: 400 },
    { name: 'insufficient Cost', error: 'COST_EXCEEDED', frame: 1 },
    { name: 'card outside hand', error: 'OUT_OF_WINDOW', frame: 400, count: 6 },
    { name: 'missing form', error: 'INVALID_CONDITION', frame: 400 },
    { name: 'invalid condition end', error: 'INVALID_CONDITION', frame: 400 },
    { name: 'non-interruptible cast', error: 'COOLDOWN', frame: 501 },
  ]
  it.each(cases)('$name preserves Cost, uses, cards, effects and later outcomes', ({ name, error, frame, count }) => {
    const battle = baselineBattle(count)
    const caster = battle.students.get(900001)!
    const support = battle.students.get(900002)!
    caster.Skills.E.Effects.push({ Type: 'Summon', SummonId: 40015, Duration: 30_000 })
    caster.Skills.E.ExtraSkills = [{ ...caster.Skills.E, Id: 'baseline-form' }]
    support.Skills.P.Effects = [{ Type: 'CostChange', Target: 'Ally', ValueType: 'BaseAmount', Value: [[-1]], Uses: 2 }]
    const discount: Intent = { ...baselineEx('discount', 0, support.Id), type: 'NS_TRIGGER', skillRef: { kind: 'public' }, priority: 2, targetIds: [caster.Id] }
    const prefix = [discount]
    if (name === 'non-interruptible cast') prefix.push(baselineEx('first', 500))
    const failed = baselineEx('rejected', frame)
    if (name === 'invalid target') failed.targetIds = [999999]
    if (name === 'missing form') failed.skillRef = { kind: 'extra_ex', extraSkillId: 'baseline-form' }
    if (name === 'invalid condition end') failed.trigger = { source: 'manual', reasons: ['hp_threshold'], conditionEndFrame: frame - 1 }
    if (name === 'card outside hand') {
      failed.issuerId = 900006
      failed.targetIds = [900006]
      discount.targetIds.push(900006)
    }
    const engine = new SimulationEngine()
    // Explicit deck prevents a failed attempt from altering the inferred initial deck.
    const reference = engine.simulateInput({ ...battle, intents: [...prefix, baselineEx('later', 900)] })
    const result = engine.simulateInput({ ...battle, intents: [...prefix, failed, baselineEx('later', 900)] })
    expect(reference.errors).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ frame, type: error })
    expect({ ...result, errors: [] }).toEqual(reference)
    expect(result.effectAudit.some(record => record.effectType === 'CostChange' && (record.action === 'used' || record.action === 'consumed'))).toBe(true)
  })
})

describe('baseline: deterministic replay', () => {
  it('reuses one engine without leaking previous battle state or mutating inputs/results', () => {
    const battle = baselineBattle()
    battle.students.get(900001)!.Skills.E.Effects.push({ Type: 'Summon', SummonId: 40015, ApplyFrame: 5, Duration: 30_000 })
    const input = { ...battle, intents: [baselineEx('spawn', 500), baselineEx('replace', 900)] }
    const original = structuredClone(input)
    const engine = new SimulationEngine()
    const first = engine.simulateInput(input)
    const savedResult = structuredClone(first)
    expect(first.errors).toEqual([])
    expect(first.finalSummons).toHaveLength(1)
    expect(first.effectAudit.some(record => record.action === 'replaced')).toBe(true)
    engine.simulateInput({ ...baselineBattle(6), intents: [] })
    expect(engine.simulateInput(input)).toEqual(savedResult)
    expect(first).toEqual(savedResult)
    expect(input).toEqual(original)
  })
})

describe('baseline: summon target lifetime', () => {
  it.each(['expired', 'replaced'] as const)('rejects a logical reference at the exact %s frame without affecting a later valid target', (removal) => {
    const battle = baselineBattle()
    const caster = battle.students.get(900001)!
    caster.Skills.E.Cost = [0]
    caster.Skills.E.Duration = 1
    caster.Skills.E.Effects = [{ Type: 'Summon', SummonId: 40015, Duration: removal === 'expired' ? 1_000 : 30_000 }]
    battle.students.get(900002)!.Skills.P.Effects = [{ Type: 'Buff', Target: 'Ally', Stat: 'AttackPower_Base', Scale: [50], Duration: 1_000 }]
    const target = (id: string, frame: number, sourceEventId: string): Intent => ({ ...baselineEx(id, frame, 900002), type: 'NS_TRIGGER', priority: 2, skillRef: { kind: 'public' }, targetIds: [], targetSummonRefs: [{ sourceEventId, summonId: 40015, spawnIndex: 0 }] })
    const prefix = [baselineEx('spawn', 0), target('valid-before', 29, 'spawn')]
    const nextSpawn = baselineEx('replacement', removal === 'replaced' ? 30 : 31)
    const suffix = [target('valid-after', 32, 'replacement')]
    const engine = new SimulationEngine()
    const reference = engine.simulateInput({ ...battle, intents: [...prefix, nextSpawn, ...suffix] })
    const actual = engine.simulateInput({ ...battle, intents: [...prefix, nextSpawn, target('invalid-old', 30, 'spawn'), ...suffix] })
    expect(reference.errors).toEqual([])
    expect(actual.errors).toHaveLength(1)
    expect(actual.errors[0]).toMatchObject({ frame: 30, message: expect.stringContaining('not active') })
    expect(actual.effectAudit).toContainEqual(expect.objectContaining({ frame: 30, effectType: 'Summon', action: removal }))
    expect({ ...actual, errors: [] }).toEqual(reference)
  })
})
