import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import { SimulationEngine } from '../core/simulationEngine'
import { rules } from '../../domain/rules/GameRules'
import { resolveSkill } from './SkillResolver'

const database = studentData as unknown as StudentDB
const students = Object.values(database)

function student(id: number): Student {
  const value = database[String(id)]
  if (!value) throw new Error(`missing fixture student ${id}`)
  return value
}

function isOpeningDescription(desc: string): boolean {
  return desc.startsWith('<b>战术入场时：</b>') || desc.startsWith('<b>战斗开始时：</b>')
}

function run(ids: number[], passiveLevel = 10, publicLevel = 10, maxFrame = 150) {
  const selected = ids.map(student)
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    {
      mode: 'normal',
      slots: ids,
      publicSkillLevels: ids.map(() => publicLevel),
      passiveSkillLevels: ids.map(() => passiveLevel),
    },
    new Map(selected.map(value => [value.Id, value])),
  )
  return engine.simulate([])
}

describe('versioned battle-start NS/SS rules', () => {
  it('matches every opening P, G and EP skill in student data', () => {
    const expected = new Set<string>()
    for (const value of students) {
      for (const kind of ['P', 'G', 'EP'] as const) {
        const skill = value.Skills[kind]
        if (skill?.Name && isOpeningDescription(skill.Desc)) expected.add(`${value.Id}:${kind}`)
      }
    }

    const actual = new Set<string>()
    for (const value of students) {
      for (const spec of rules.trigger.automatic(value)) {
        const kind = spec.skillRef.kind === 'public' ? 'P' : spec.skillRef.kind === 'gear_public' ? 'G' : spec.skillRef.kind === 'extra_passive' ? 'EP' : null
        if (kind) actual.add(`${value.Id}:${kind}`)
      }
    }

    expect(actual).toEqual(expected)
    expect([...actual].filter(key => key.endsWith(':P'))).toHaveLength(5)
    expect([...actual].filter(key => key.endsWith(':G'))).toHaveLength(1)
    expect([...actual].filter(key => key.endsWith(':EP'))).toHaveLength(119)
  })

  it('references valid source effects and never executes opening Damage directly', () => {
    for (const value of students) {
      for (const spec of rules.trigger.automatic(value)) {
        if (!['public', 'gear_public', 'extra_passive'].includes(spec.skillRef.kind)) continue
        const skill = resolveSkill(value, spec.skillRef, { ex: 5, ns: 10, ss: 10 })
        expect(skill, `${value.Name}:${spec.skillRef.kind}`).not.toBeNull()
        if (!skill) continue
        for (const index of spec.effectIndices ?? skill.effects.map((_, index) => index)) {
          expect(skill.effects[index], `${value.Name}:${spec.skillRef.kind}[${index}]`).toBeDefined()
          expect(skill.effects[index]?.Type, `${value.Name}:${spec.skillRef.kind}[${index}]`).not.toBe('Damage')
        }
        const effectCount = (spec.effectIndices?.length ?? skill.effects.length) + (spec.syntheticEffects?.length ?? 0)
        expect(effectCount > 0 || (spec.initialCostByLevel?.length ?? 0) > 0, value.Name).toBe(true)
      }
    }
  })

  it('grants Shun opening Cost at the selected NS level', () => {
    const result = run([10011], 10, 10, 0)
    expect(result.costHistory[0]).toBe(3.8 * 300_000 + 700)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10011,
      effectType: 'CostGrant',
      detail: '+3.8 COST',
    }))
  })

  it('applies opening team discounts to allies but not the caster', () => {
    const result = run([20027, 10005], 10, 10, 30)
    const applied = result.effectAudit.filter(record => record.issuerId === 20027 && record.effectType === 'CostChange' && record.action === 'applied')
    expect(applied.map(record => record.targetIds[0])).toEqual([10005])
  })

  it('separates opening clauses from later conditional effects', () => {
    const idolMari = run([10105], 10, 10, 0)
    expect(idolMari.effectAudit.some(record => record.skillRef.kind === 'extra_passive' && record.effectType === 'Buff' && record.action === 'applied')).toBe(true)
    expect(idolMari.effectAudit.some(record => record.skillRef.kind === 'extra_passive' && record.effectType === 'CostChange')).toBe(false)

    const shigure = run([10055], 10, 10, 0)
    expect(shigure.effectLedger).toHaveLength(0)
    expect(shigure.finalRuntimes.get(0)?.specialStacks.NormalAttackAreaOverride_Shigure).toBe(1)
  })

  it('selects formation-dependent opening values at the requested SS level', () => {
    const cherinoAlone = run([10017], 1, 10, 0)
    expect(cherinoAlone.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10017,
      effectType: 'Buff',
      detail: 'RegenCost_Base=269',
    }))

    const cherinoWithRedWinter = run([10017, 20009], 1, 10, 0)
    expect(cherinoWithRedWinter.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10017,
      effectType: 'Buff',
      detail: 'RegenCost_Base=346',
    }))

    const midoriAndMomoi = run([10016, 13011], 1, 10, 0)
    expect(midoriAndMomoi.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10016,
      detail: 'AttackSpeed_Coefficient=1815',
    }))
    expect(midoriAndMomoi.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 13011,
      detail: 'AttackPower_Coefficient=1815',
    }))
  })

  it('does not grant Saori squad synergy without a second Arius member', () => {
    const alone = run([10048], 1, 10, 0)
    expect(alone.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10048,
      effectType: 'Buff',
      action: 'rejected',
      detail: 'formation condition not met',
    }))

    const paired = run([10048, 10042], 1, 10, 0)
    expect(paired.effectAudit).toContainEqual(expect.objectContaining({
      issuerId: 10048,
      effectType: 'Buff',
      action: 'applied',
      detail: 'AttackPower_Coefficient=1932',
    }))
  })
})
