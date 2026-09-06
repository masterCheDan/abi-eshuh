import { describe, expect, it } from 'vitest'
import { preparePlanImport, exportPlanSnapshot } from './planTransfer'
import { decodeShareCode } from './shareCode'
import { decode, encode } from './shareCode/v4'
import { shareScenario } from '../engine/baseline/shareScenario'
import { SimulationEngine } from '../engine/core/simulationEngine'
import { buildFormation, lanesToIntents } from '../engine/bridge'
import * as v001 from './shareCode/v001'
import * as v1 from './shareCode/v1'
import * as v2 from './shareCode/v2'
import * as v3 from './shareCode/v3'
import bossData from '../data/bosses.min.json'
import type { BossData } from '../types/boss'
import type { StudentDB } from '../types/student'
import studentsData from '../data/students.min.json'
import { baselineSlots } from '../engine/baseline/fixtures'
import { runSimulation } from '../engine/bridge'

describe('production plan transfer', () => {
  it('B04: replays non-default levels, ranks, environment, duration and summon facts without mutation', () => {
    const s = shareScenario()
    const nsScheduling = { enabled: true, ruleVersion: 1, nsModes: s.lanes.map((_, index) => index === 0 ? 'automatic' as const : 'manual' as const) }
    Object.assign(s.slots[0], { exLevel: 1, nsLevel: 2, ssLevel: 3 })
    s.slots[1].nsLevel = 1
    const original = structuredClone(s)
    const decoded = decodeShareCode(exportPlanSnapshot({ ...s, nsScheduling }).code)!
    const result = preparePlanImport(decoded, s.battle.students)
    if ('error' in result) throw new Error(result.error)
    expect(result.plan.env).toEqual(s.env)
    expect(result.plan.nsScheduling).toEqual(nsScheduling)
    expect(result.plan.slots.map(slot => [slot.exLevel, slot.nsLevel, slot.ssLevel])).toEqual(s.slots.map(slot => [slot.exLevel, slot.nsLevel, slot.ssLevel]))
    expect(buildFormation(result.plan.lanes, result.plan.deckOrder, result.plan.slots)).toEqual(buildFormation(s.lanes, s.deckOrder, s.slots))
    expect(result.plan.lanes[1].skills[0]).toMatchObject({ eventId: 'buff', targetIds: [900001], targetSummonRefs: [{ sourceEventId: 'spawn', summonId: 40015, spawnIndex: 0 }], trigger: { source: 'manual', reasons: ['external_state'], conditionEndFrame: 540 } })
    const simulate = (plan: Pick<typeof s, 'lanes' | 'slots' | 'env' | 'deckOrder'> & { nsScheduling: typeof nsScheduling }) => new SimulationEngine().simulateInput({ students: s.battle.students, env: plan.env, formation: buildFormation(plan.lanes, plan.deckOrder, plan.slots), intents: lanesToIntents(plan.lanes, plan.slots), nsScheduling: plan.nsScheduling })
    const before = simulate({ ...s, nsScheduling }), after = simulate(result.plan)
    // Two equally invalid plans are not proof of a successful replay.
    expect(before.errors).toEqual([])
    expect(before.window?.left).toBe(1)
    expect(before.effectAudit).toContainEqual(expect.objectContaining({ action: 'applied', targetIds: ['summon-spawn-40015-0'], value: 10 }))
    expect(after).toEqual(before)
    expect(s).toEqual(original)
  })
  it.each([v2, v3])('imports legacy $VERSION with explicit missing-field warnings', codec => {
    const s = shareScenario()
    s.lanes.forEach(lane => { lane.skills = [] })
    const data = codec.decode(codec.encode(s.lanes))
    const result = preparePlanImport({ version: codec.VERSION, data }, s.battle.students)
    if ('error' in result) throw new Error(result.error)
    expect(result.plan.slots.every(slot => slot.exLevel === 5 && slot.nsLevel === 10 && slot.ssLevel === 10)).toBe(true)
    expect(result.plan.env.maxFrame).toBe(5400)
    expect(result.plan.warnings).toHaveLength(3)
  })
  it.each([v001, v1])('migrates populated legacy $VERSION to manual EX facts', codec => {
    const s = shareScenario()
    s.lanes.forEach(lane => { lane.skills = lane.skills.filter(skill => skill.type === 'ex') })
    const result = preparePlanImport({ version: codec.VERSION, data: codec.decode(codec.encode(s.lanes)) }, s.battle.students)
    if ('error' in result) throw new Error(result.error)
    const events = result.plan.lanes.flatMap(lane => lane.skills)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every(event => event.skillRef?.kind === 'ex' && event.trigger?.source === 'manual' && event.triggerSource === 'manual')).toBe(true)
    expect(events.map(event => event.startFrame)).toEqual(s.lanes.flatMap(lane => lane.skills).map(event => event.startFrame))
    expect(result.plan.slots.every(slot => slot.exLevel === 5 && slot.nsLevel === 10 && slot.ssLevel === 10)).toBe(true)
    expect(result.plan.env.maxFrame).toBe(5400)
    expect(result.plan.warnings).toHaveLength(3)
  })
  it('imports old v4 with defaults but does not silently repair invalid present fields', () => {
    const s = shareScenario(), raw = JSON.parse(encode(s.lanes))
    delete raw.levels; delete raw.maxFrame
    const result = preparePlanImport({ version: '4.0.0', data: decode(JSON.stringify(raw)) }, s.battle.students)
    expect(result).toHaveProperty('plan.warnings', expect.any(Array))
    expect(result).toHaveProperty('plan.nsScheduling', { enabled: false, ruleVersion: 1, nsModes: ['manual', 'manual', 'manual'] })
    for (const levels of [[], [[0, 10, 10]], null, [[6, 10, 10], [5, 10, 10], [5, 10, 10]]]) expect(decode(JSON.stringify({ ...raw, levels }))).toBeNull()
    for (const maxFrame of [-1, 0.5, null]) expect(decode(JSON.stringify({ ...raw, maxFrame }))).toBeNull()
  })
  it('does not accept a v5 plan that omits or corrupts scheduling settings', () => {
    const s = shareScenario()
    const missing = preparePlanImport({ version: '5.0.0', data: decode(encode(s.lanes)) }, s.battle.students)
    expect(missing).toEqual(expect.objectContaining({ error: '自动 NS 调度设置缺失' }))
  })
  it('replays an explicitly enabled reviewed automatic NS with identical execution records', () => {
    const student = structuredClone((studentsData as unknown as StudentDB)[10012])
    const lanes = [{ slotIndex: 0, label: 'STRIKER 1', studentId: student.Id, student, skills: [] }]
    const slots = baselineSlots(lanes)
    const env = { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 2500 }
    const nsScheduling = { enabled: true, ruleVersion: 1, nsModes: ['automatic' as const] }
    const source = runSimulation({ lanes, students: new Map([[student.Id, student]]), slotLevels: slots, ...env, nsScheduling })
    const imported = preparePlanImport(decodeShareCode(exportPlanSnapshot({ lanes, slots, deckOrder: null, env, nsScheduling }).code)!, new Map([[student.Id, student]]))
    if ('error' in imported) throw new Error(imported.error)
    const replayed = runSimulation({ lanes: imported.plan.lanes, students: new Map([[student.Id, student]]), slotLevels: imported.plan.slots, deckOrder: imported.plan.deckOrder, ...imported.plan.env, nsScheduling: imported.plan.nsScheduling })
    expect(source.nsScheduling.records.map(record => [record.triggerFrame, record.castFrame])).toEqual([[1200, 1200], [2400, 2400]])
    expect(replayed).toEqual(source)
  })
  it.each(['student', 'skill'])('rejects unresolved %s without skipping events', kind => {
    const s = shareScenario(), raw = JSON.parse(encode(s.lanes))
    if (kind === 'student') raw.form[0] = 999999
    if (kind === 'skill') raw.events[0].skillRef = { kind: 'extra_ex', extraSkillId: 'missing' }
    const data = decode(JSON.stringify(raw))
    expect(data).not.toBeNull()
    const result = preparePlanImport({ version: '4.0.0', data }, s.battle.students)
    expect(result).toHaveProperty('error')
  })
  it('blocks export with pending suggestions', () => {
    expect(() => exportPlanSnapshot({ ...shareScenario(), pendingSuggestions: 1 })).toThrow('待确认')
  })
  it('derives old-code duration from the selected Boss and preserves zero when explicitly saved', () => {
    const s = shareScenario(), raw = JSON.parse(encode(s.lanes))
    const bosses = bossData as unknown as Record<string, BossData>
    const boss = Object.values(bosses).find(b => b.BattleDuration.some(seconds => seconds !== 180))!
    const difficulty = boss.BattleDuration.findIndex(seconds => seconds !== 180)
    raw.env = [boss.Id, difficulty, 1, 2]
    delete raw.maxFrame
    const result = preparePlanImport({ version: '4.0.0', data: decode(JSON.stringify(raw)) }, s.battle.students, bosses)
    expect(result).toHaveProperty('plan.env.maxFrame', boss.BattleDuration[difficulty] * 30)
    expect(decode(JSON.stringify({ ...raw, maxFrame: 0 }))?.maxFrame).toBe(0)
  })
  it('preserves unresolved legacy summon targets as invalid facts instead of dropping them', () => {
    const s = shareScenario()
    s.lanes[1].skills[0].targetSummonIds!.push('legacy-unknown-target')
    const result = preparePlanImport(decodeShareCode(exportPlanSnapshot(s).code)!, s.battle.students)
    if ('error' in result) throw new Error(result.error)
    expect(result.plan.lanes[1].skills[0].targetSummonIds).toEqual(['legacy-unknown-target'])
    expect(result.plan.lanes[1].skills[0].targetSummonRefs).toHaveLength(1)
  })
})
