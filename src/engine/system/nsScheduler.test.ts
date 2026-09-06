import { expect, it } from 'vitest'
import data from '../../data/students.min.json'
import type { StudentDB } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine, type SimulationInput } from '../core/simulationEngine'
import { baselineBattle, baselineEx } from '../baseline/fixtures'
import { rules } from '../../domain/rules/GameRules'
import { checkNsSchedulingRegistration } from '../../domain/rules/nsSchedulingData.mjs'
import { nsWaitingSegments } from '../../components/timeline/actionTrackModel'

function input(gear = 0, id = 10012): SimulationInput {
  const battle = baselineBattle(2)
  const student = structuredClone((data as unknown as StudentDB)[id])
  // Retain real NS and passives; make a deterministic free EX for action boundary tests.
  student.Skills.E = { ...battle.students.get(900001)!.Skills.E, Cost: [0], Duration: 300 }
  battle.students.delete(900001)
  battle.students.set(student.Id, student)
  battle.formation.slots[0] = student.Id
  battle.formation.gearLevels = [gear, 0]
  battle.formation.publicSkillLevels = [1, 10]
  battle.env.maxFrame = 2700
  return { ...battle, intents: [], nsScheduling: { enabled: true, ruleVersion: 1, nsModes: ['automatic', 'manual'] } }
}
const run = (value: SimulationInput) => new SimulationEngine().simulateInput(value)

it('requires opt-in, uses the actual gear/level and records each real activation once', () => {
  const value = input()
  expect(run({ ...value, nsScheduling: undefined }).nsScheduling.records).toEqual([])
  expect(run({ ...value, nsScheduling: { ...value.nsScheduling!, enabled: false } }).nsScheduling.records).toEqual([])
  const plain = run(value)
  expect(plain.errors).toEqual([])
  expect(plain.nsScheduling.records.map(r => [r.triggerFrame, r.castFrame])).toEqual([[1200, 1200], [2400, 2400]])
  const action = plain.actionLogs.find(r => r.actionType === 'NS')!
  expect(action).toMatchObject({ startFrame: 1200, endFrame: 1265, effectFrame: 1242, triggerFrame: 1200 })
  expect(plain.effectAudit.filter(r => r.actionId === action.recordId && r.action === 'applied'))
    .toEqual([expect.objectContaining({ frame: 1242, value: value.students.get(10012)!.Skills.P.Effects[0].Value![0][0] })])
  const geared = run(input(1))
  const gearedAction = geared.actionLogs.find(r => r.actionType === 'NS')!
  expect(geared.nsScheduling.records[0].skillRef.kind).toBe('gear_public')
  expect(geared.effectAudit.filter(r => r.actionId === gearedAction.recordId && r.action === 'applied')).toHaveLength(2)
  const bunny = run(input(0, 10028))
  expect(bunny.errors).toEqual([])
  expect(bunny.actionLogs.find(r => r.actionType === 'NS')).toMatchObject({ startFrame: 1050, effectFrame: 1071, endFrame: 1127 })
  const before = structuredClone(value)
  const engine = new SimulationEngine()
  expect(engine.simulateInput(value)).toEqual(engine.simulateInput(value))
  expect(value).toEqual(before)
})

it('waits for an EX including a same-frame EX, then resets from actual cast start', () => {
  for (const [exFrame, castFrame] of [[1100, 1400], [1200, 1500]]) {
    const value = input()
    value.intents = [baselineEx('ex', exFrame, 10012)]
    const result = run(value)
    expect(result.errors).toEqual([])
    expect(result.nsScheduling.records.map(r => [r.triggerFrame, r.castFrame]))
      .toEqual([[1200, castFrame], [castFrame + 1200, castFrame + 1200]])
    expect(result.nsScheduling.records[0].waits).toEqual([{ startFrame: 1200, endFrame: castFrame, reason: 'action' }])
  }
  const failed = input()
  failed.students.get(10012)!.Skills.E.Cost = [99, 99, 99, 99, 99]
  const reference = run(failed)
  failed.intents = [baselineEx('unaffordable', 1200, 10012)]
  const actual = run(failed)
  expect(actual.errors).toEqual([expect.objectContaining({ type: 'COST_EXCEEDED' })])
  expect({ ...actual, errors: [] }).toEqual(reference)
})

it('coalesces a long control wait, casts at the release boundary and closes an unfinished wait', () => {
  const value = input()
  value.env.maxFrame = 5300
  value.students.get(900002)!.Skills.P.Effects = [{ Type: 'CrowdControl', Target: 'Ally', Duration: 100000 }]
  value.intents = [{ ...baselineEx('control', 1100, 900002), type: 'NS_TRIGGER', skillRef: { kind: 'public' }, targetIds: [10012] }]
  const result = run(value)
  expect(result.errors).toEqual([])
  expect(result.nsScheduling.records.map(r => [r.triggerFrame, r.castFrame])).toEqual([[1200, 4100], [5300, 5300]])
  expect(result.nsScheduling.records[0].waits).toEqual([{ startFrame: 1200, endFrame: 4100, reason: 'control' }])
  const saved = structuredClone(result)
  expect(nsWaitingSegments(result, 0, 2500)).toEqual([expect.objectContaining({ startFrame: 1200, endFrame: 2500, castFrame: 4100, reason: 'control' })])
  expect(nsWaitingSegments(result, 1, 5300)).toEqual([])
  expect(nsWaitingSegments(null, 0, 5300)).toEqual([])
  expect(result).toEqual(saved)
  value.env.maxFrame = 2500
  const short = run(value)
  expect(short.nsScheduling.records).toEqual([expect.objectContaining({ status: 'waiting', waits: [{ startFrame: 1200, endFrame: 2500, reason: 'control' }] })])
  expect(short.actionLogs.some(r => r.actionType === 'NS' && r.studentId === 10012)).toBe(false)
})

it('preserves existing NS facts instead of silently switching them to automatic mode', () => {
  const value = input()
  for (const source of ['manual', 'automatic'] as const) {
    const fact: Intent = { id: 'original', frame: 1200, issuerId: 10012, targetIds: [], type: 'NS_TRIGGER', priority: 2, skillRef: { kind: 'public' }, trigger: { source } }
    const result = run({ ...value, intents: [fact] })
    expect(result.errors).toEqual([])
    expect(result.nsScheduling.records).toEqual([])
    expect(result.nsScheduling.slots[0]).toMatchObject({ requestedMode: 'automatic', mode: 'manual', eligible: false })
    expect(result.schedulingDiagnostics).toContainEqual(expect.objectContaining({ code: 'NS_AUTOMATION_BLOCKED' }))
    expect(result.actionLogs.filter(r => r.studentId === 10012 && r.actionType === 'NS')).toHaveLength(1)
  }
})

it('stops unverified interrupted automatic NS, suppresses pending effects but retains applied effects', () => {
  for (const [exFrame, applied] of [[1220, false], [1250, true]] as const) {
    const value = input()
    value.intents = [baselineEx('interrupt', exFrame, 10012)]
    const result = run(value)
    expect(result.errors).toEqual([])
    expect(result.nsScheduling.records).toHaveLength(1)
    expect(result.nsScheduling.records[0].status).toBe('interrupted')
    const audit = result.effectAudit.filter(r => r.actionId === result.nsScheduling.records[0].actionId)
    expect(audit.some(r => r.action === 'applied')).toBe(applied)
    expect(audit.some(r => r.action === 'rejected')).toBe(!applied)
    expect(result.schedulingDiagnostics).toContainEqual(expect.objectContaining({ code: 'AUTO_NS_INTERRUPTED' }))
  }
})

it('fails closed for unknown modes/versions, unreviewed skills and changed effect structure', () => {
  const value = input()
  for (const config of [
    { ...value.nsScheduling!, ruleVersion: 99 },
    { ...value.nsScheduling!, nsModes: [] },
    { ...value.nsScheduling!, nsModes: Array(2) },
  ]) expect(() => run({ ...value, nsScheduling: config })).toThrow('INVALID_SCHEDULING_CONFIG')
  for (const [id, gear, eligible] of [[10012, 0, true], [10012, 1, true], [10028, 0, true], [10028, 1, false], [10000, 0, false], [10015, 0, false], [20000, 0, false]] as const) {
    expect(rules.nsScheduling.eligibility((data as unknown as StudentDB)[id], gear).eligible).toBe(eligible)
  }
  value.students.get(10012)!.Skills.P.Effects[0].Target = 'Ally'
  const blocked = run(value)
  expect(blocked.nsScheduling.records).toEqual([])
  expect(blocked.nsScheduling.slots[0].eligible).toBe(false)
  const catalog = structuredClone(rules.catalog)
  catalog.nsScheduling.policies.cast_reset.clock = 'battle_start'
  Object.assign(catalog.nsScheduling.skills, { 999999: catalog.nsScheduling.skills['10012'] })
  const errors = checkNsSchedulingRegistration(data, catalog).errors
  expect(errors).toContainEqual(expect.objectContaining({ path: 'nsScheduling.policies.cast_reset.clock' }))
  expect(errors).toContainEqual(expect.objectContaining({ path: 'nsScheduling.skills.999999.P' }))
})
