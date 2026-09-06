import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine } from '../core/simulationEngine'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

function run(ids: number[], intents: Intent[], maxFrame = 1800) {
  const students = new Map(ids.map(id => [id, database[String(id)] as Student]))
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    {
      mode: 'normal',
      slots: ids,
      skillLevels: ids.map(() => 5),
      publicSkillLevels: ids.map(() => 10),
      passiveSkillLevels: ids.map(() => 10),
    },
    students,
  )
  return engine.simulate(intents)
}

describe('conditional SS facts with conditionEndFrame', () => {
  it('ends a Duration-less conditional buff at the user-provided end frame', () => {
    // 阿露 EP「暴徒的做派」：自身使用 EX 期间 CriticalPoint 增益（效果无 Duration，可手动确认事实）。
    const result = run([10000], [
      { id: 'ss', frame: 20, type: 'SS_TRIGGER', issuerId: 10000, targetIds: [10000], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['action_event'], conditionEndFrame: 1520 } },
    ])
    const applied = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'CriticalPoint_Coefficient' && record.action === 'applied')
    expect(applied?.expiresAt).toBe(1520)
    const expired = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'CriticalPoint_Coefficient' && record.action === 'expired')
    expect(expired?.frame).toBe(1520)
  })

  it('keeps a Duration-less buff permanent when no end frame is confirmed', () => {
    const result = run([10000], [
      { id: 'ss', frame: 20, type: 'SS_TRIGGER', issuerId: 10000, targetIds: [10000], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual' } },
    ])
    const applied = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'CriticalPoint_Coefficient' && record.action === 'applied')
    expect(applied?.expiresAt).toBeUndefined()
    expect(result.effectAudit.some(record => record.effectType === 'Buff' && record.stat === 'CriticalPoint_Coefficient' && record.action === 'expired')).toBe(false)
  })
})

describe('self-EX buff auto SS', () => {
  it('auto-applies Hoshino (swimsuit) EP with the same duration as her EX buff', () => {
    const result = run([10045], [
      { id: 'ex', frame: 2200, type: 'EX_CAST', issuerId: 10045, targetIds: [10045], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual', trigger: { source: 'manual' } },
    ], 4000)
    const exBuff = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'AttackPower_Coefficient' && record.action === 'applied' && record.skillRef.kind === 'ex')
    expect(exBuff?.frame).toBe(2220)
    expect(exBuff?.expiresAt).toBe(3720)
    const ss = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'RegenCost_Base' && record.action === 'applied')
    expect(ss?.skillRef.kind).toBe('extra_passive')
    expect(ss?.frame).toBe(2220)
    expect(ss?.expiresAt).toBe(3720)
    expect(ss?.value).toBe(684)
    const expired = result.effectAudit.find(record => record.effectType === 'Buff' && record.stat === 'RegenCost_Base' && record.action === 'expired')
    expect(expired?.frame).toBe(3720)
  })

  it('rejects a manual SS fact for auto-SS students', () => {
    const result = run([10045], [
      { id: 'ss', frame: 20, type: 'SS_TRIGGER', issuerId: 10045, targetIds: [10045], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['action_event'] } },
    ])
    expect(result.errors).toContainEqual(expect.objectContaining({
      type: 'INVALID_TRIGGER',
      message: expect.stringContaining('不能作为外部事件重复注入'),
    }))
  })

  it('registers every EP whose description lasts while the EX effect is active', () => {
    const discovered = new Set<number>()
    for (const student of Object.values(database)) {
      const ep = student.Skills.EP
      if (ep?.Desc && /EX技能效果持续期间/.test(ep.Desc)) discovered.add(student.Id)
    }
    expect([...discovered].sort((left, right) => left - right))
      .toEqual([...rules.skill.selfExBuffEpIds].sort((left, right) => left - right))
  })
})
