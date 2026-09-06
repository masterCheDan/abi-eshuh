import { describe, expect, it } from 'vitest'
import { baselineBattle, baselineStudent } from './fixtures'
import { SimulationEngine } from '../core/simulationEngine'
import type { Intent } from '../model/types'
import { normalizeTrigger } from '../../domain/triggerEvidence'

function fixture() {
  const battle = baselineBattle()
  const student = baselineStudent(10000)
  student.Skills.P.Effects = [{ Type: 'Buff', Target: 'Self', Stat: 'AttackPower_Base', Value: [[10]] }]
  battle.students.delete(900001)
  battle.students.set(10000, student)
  battle.formation.slots[0] = 10000
  battle.formation.gearLevels = [0, 0, 0]
  const intent: Intent = { id: 'period', frame: 750, issuerId: 10000, targetIds: [10000], type: 'NS_TRIGGER', priority: 2, skillRef: { kind: 'public' }, trigger: { source: 'automatic' }, triggerSource: 'automatic' }
  return { battle, student, intent }
}

describe('external trigger facts', () => {
  it('normalizes missing and single sources without mutating them', () => {
    expect(normalizeTrigger({})).toEqual({ triggerSource: 'manual', trigger: { source: 'manual' } })
    for (const source of ['automatic', 'manual']) {
      expect(normalizeTrigger({ triggerSource: source })).toEqual({ triggerSource: source, trigger: { source } })
      expect(normalizeTrigger({ trigger: { source } })).toEqual({ triggerSource: source, trigger: { source } })
    }
    expect(normalizeTrigger({ triggerSource: 'automatic', trigger: { source: 'manual' } })).toHaveProperty('error')
    expect(normalizeTrigger({ triggerSource: null })).toHaveProperty('error')
    expect(normalizeTrigger({ trigger: null })).toHaveProperty('error')
  })
  it('accepts registered periodic NS and rejects a duplicate without extra effects', () => {
    const { battle, intent } = fixture()
    const engine = new SimulationEngine()
    const reference = engine.simulateInput({ ...battle, intents: [intent] })
    expect(reference.errors).toEqual([])
    const result = engine.simulateInput({ ...battle, intents: [intent, { ...intent, id: 'duplicate' }] })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].type).toBe('INVALID_TRIGGER')
    expect({ ...result, errors: [] }).toEqual(reference)
  })
  // B02 is covered here alongside other trigger eligibility failures.
  it.each(['unregistered', 'wrong-frame', 'frame-zero', 'negative', 'fraction', 'outside', 'gear', 'ex', 'opening', 'conflict', 'chance', 'select-target', 'attack-count'])('rejects %s before any side effects', kind => {
    const { battle, student, intent } = fixture()
    if (kind === 'wrong-frame') intent.frame = 749
    if (kind === 'frame-zero' || kind === 'opening') intent.frame = 0
    if (kind === 'opening') { intent.id = 'entry-0-public'; intent.skillRef = { kind: 'passive' } }
    if (kind === 'negative') intent.frame = -1
    if (kind === 'fraction') intent.frame = 750.5
    if (kind === 'outside') intent.frame = 1000
    if (kind === 'gear') intent.skillRef = { kind: 'gear_public' }
    if (kind === 'ex') { intent.type = 'EX_CAST'; intent.skillRef = { kind: 'ex' } }
    if (kind === 'conflict') intent.triggerSource = 'manual'
    if (kind === 'chance') student.Skills.P.Effects[0].Chance = 5000
    if (kind === 'select-target') student.Skills.P.Effects[0].Target = 'Ally'
    if (kind === 'attack-count' || kind === 'unregistered') {
      student.Id = kind === 'attack-count' ? 10059 : 900004
      battle.students.delete(10000); battle.students.set(student.Id, student); battle.formation.slots[0] = student.Id; intent.issuerId = student.Id; intent.targetIds = [student.Id]
    }
    const engine = new SimulationEngine()
    const reference = engine.simulateInput({ ...battle, intents: [] })
    const result = engine.simulateInput({ ...battle, intents: [intent] })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].type).toBe('INVALID_TRIGGER')
    expect({ ...result, errors: [] }).toEqual(reference)
  })
  it('requires probability evidence for a manual effect', () => {
    const { battle, student, intent } = fixture()
    student.Skills.P.Effects[0].Chance = 5000
    intent.triggerSource = 'manual'; intent.trigger = { source: 'manual' }
    expect(new SimulationEngine().simulateInput({ ...battle, intents: [intent] }).errors[0].type).toBe('INVALID_TRIGGER')
    intent.trigger.reasons = ['chance']
    expect(new SimulationEngine().simulateInput({ ...battle, intents: [intent] }).errors).toEqual([])
  })
  it.each(['passive', 'weapon_passive'] as const)('cannot inject opening %s by claiming a manual source', kind => {
    const { battle, intent } = fixture()
    intent.skillRef = { kind }; intent.triggerSource = 'manual'; intent.trigger = { source: 'manual' }
    const engine = new SimulationEngine()
    const result = engine.simulateInput({ ...battle, intents: [intent] })
    expect(result.errors[0].type).toBe('INVALID_TRIGGER')
    expect({ ...result, errors: [] }).toEqual(engine.simulateInput({ ...battle, intents: [] }))
  })
  it('requires action evidence even when an attack-count NS is submitted directly as manual', () => {
    const { battle, student, intent } = fixture()
    student.Id = 10059
    battle.students.delete(10000); battle.students.set(student.Id, student)
    battle.formation.slots[0] = student.Id
    intent.issuerId = student.Id; intent.targetIds = [student.Id]
    intent.triggerSource = 'manual'; intent.trigger = { source: 'manual' }
    const engine = new SimulationEngine()
    const rejected = engine.simulateInput({ ...battle, intents: [intent] })
    expect(rejected.errors[0]).toMatchObject({ type: 'INVALID_TRIGGER', message: expect.stringContaining('action_event') })
    expect({ ...rejected, errors: [] }).toEqual(engine.simulateInput({ ...battle, intents: [] }))
    intent.trigger.reasons = ['action_event']
    expect(engine.simulateInput({ ...battle, intents: [intent] }).errors).toEqual([])
  })
  it('rejects an otherwise eligible automatic NS under control without rescheduling it', () => {
    const { battle, intent } = fixture()
    const controller = battle.students.get(900002)!
    controller.Skills.P.Effects = [{ Type: 'CrowdControl', Target: 'Ally', Duration: 10000 }]
    const control: Intent = { id: 'control', frame: 700, issuerId: controller.Id, targetIds: [10000], type: 'NS_TRIGGER', priority: 2, skillRef: { kind: 'public' }, trigger: { source: 'manual' } }
    const engine = new SimulationEngine()
    const reference = engine.simulateInput({ ...battle, intents: [control] })
    expect(reference.errors).toEqual([])
    const rejected = engine.simulateInput({ ...battle, intents: [control, intent] })
    expect(rejected.errors).toHaveLength(1)
    expect(rejected.errors[0]).toMatchObject({ type: 'COOLDOWN', message: 'caster is controlled' })
    expect({ ...rejected, errors: [] }).toEqual(reference)
  })
})
