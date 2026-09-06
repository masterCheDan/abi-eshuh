import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import { SimulationEngine } from '../core/simulationEngine'
import type { Formation, Intent } from '../model/types'
import { COST_SCALE } from './costSystem'
import { costBorrowLimitAtFrame } from '../../utils/costCalc'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

function unit(id: number, cost = 0): Student {
  const passive = { Name: 'passive', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id,
    Name: `S${id}`,
    Icon: '',
    School: 'Abydos',
    SquadType: 'Main',
    TacticRole: 'DamageDealer',
    Position: 'Front',
    StarGrade: 3,
    BulletType: 'Explosion',
    ArmorType: 'LightArmor',
    WeaponType: 'AR',
    Cover: false,
    Street: 0,
    Outdoor: 0,
    Indoor: 0,
    ATK: 100,
    HP: 100,
    DEF: 0,
    HEAL: 0,
    Dodge: 0,
    Accuracy: 0,
    Crit: 0,
    CritDMG: 0,
    Ammo: 1,
    AmmoCost: 1,
    Range: 1,
    Sight: 1,
    Regen: 700,
    Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 0, AttackStartDuration: 0, AttackEndDuration: 0, AttackBurstRoundOverDelay: 0, AttackIngDuration: 0, AttackReloadDuration: 0 } },
      E: {
        Name: 'EX',
        Desc: '',
        Parameters: [],
        Cost: [cost, cost, cost, cost, cost],
        Duration: 0,
        Range: 0,
        Icon: '',
        Effects: [{ Type: 'Damage', Target: 'Enemy' }],
      },
      P: { ...passive },
      G: null,
      PS: { ...passive },
      WP: { ...passive },
      EP: { ...passive },
    },
    Weapon: { ATK: 0, HP: 0, HEAL: 0 },
    HasGear: false,
  } as unknown as Student
}

function nagisa(): Student {
  const student = unit(20048, 3)
  student.SquadType = 'Support'
  student.Skills.E.Effects = [{
    Type: 'Buff',
    Target: ['AllyMain'],
    Stat: 'CriticalDamageRate_Coefficient',
    Channel: 111,
    Duration: 26_000,
    ApplyFrame: 81,
    Scale: [7_866],
  }]
  return student
}

function ex(id: string, frame: number, issuerId: number, targetIds: number[]): Intent {
  return {
    id,
    frame,
    type: 'EX_CAST',
    issuerId,
    targetIds,
    priority: 1,
    skillRef: { kind: 'ex' },
    triggerSource: 'manual',
  }
}

function simulate(
  selected: Student[],
  intents: Intent[],
  slots: (number | null)[] = selected.map(student => student.Id),
  maxFrame = 700,
) {
  const engine = new SimulationEngine()
  const formation: Formation = { mode: 'normal', slots }
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    formation,
    new Map(selected.map(student => [student.Id, student])),
  )
  return engine.simulate(intents)
}

describe('swimsuit Nagisa CostOverload', () => {
  it('starts at ApplyFrame, permits a -5 Cost balance, and repays debt through normal regen', () => {
    const target = unit(1, 6)
    const zeroCost = unit(2, 0)
    const selected = [target, zeroCost, unit(3), unit(4), unit(5), nagisa()]
    const result = simulate(selected, [
      ex('nagisa', 220, 20048, [1]),
      ex('too-early', 300, 1, [-1]),
      ex('borrow', 301, 1, [-1]),
      ex('zero-in-debt', 302, 2, [-1]),
    ])

    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 300,
      issuerId: 1,
      type: 'COST_EXCEEDED',
    }))
    expect(result.actionLogs.map(record => record.studentId)).toEqual([20048, 1, 2])
    expect(result.costHistory[301]).toBe(-1_431_600)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      frame: 301,
      effectType: 'Special',
      action: 'applied',
      detail: 'CostOverload=5',
      targetIds: [1],
      value: 5,
      expiresAt: 1_081,
    }))
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      frame: 301,
      effectType: 'CostDebt',
      action: 'applied',
      value: 4.772,
    }))
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      frame: 642,
      effectType: 'CostDebt',
      action: 'consumed',
    }))
    expect(result.costHistory[642]).toBeGreaterThanOrEqual(0)
    expect(costBorrowLimitAtFrame(result, 1, 300)).toBe(0)
    expect(costBorrowLimitAtFrame(result, 1, 301)).toBe(5)
    expect(costBorrowLimitAtFrame(result, 1, 1_081)).toBe(0)
  })

  it('rejects debt beyond -5 atomically', () => {
    const target = unit(1, 7)
    const selected = [target, unit(2), unit(3), unit(4), unit(5), nagisa()]
    const result = simulate(selected, [
      ex('nagisa', 220, 20048, [1]),
      ex('too-much', 301, 1, [-1]),
    ], undefined, 310)

    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 301,
      type: 'COST_EXCEEDED',
    }))
    expect(result.actionLogs).toHaveLength(1)
    expect(result.costHistory[301]).toBe(368_400)
    expect(result.effectAudit.some(record => record.effectType === 'CostDebt')).toBe(false)
  })

  it('applies Cost reduction before checking the borrowing boundary', () => {
    const target = unit(1, 7)
    const reducer = unit(2)
    reducer.Skills.EP.Effects = [{
      Type: 'CostChange',
      Target: 'Ally',
      ValueType: 'BaseAmount',
      Uses: 1,
      Scale: [-2],
    }]
    const selected = [target, reducer, unit(3), unit(4), unit(5), nagisa()]
    const result = simulate(selected, [
      {
        id: 'discount',
        frame: 0,
        type: 'SS_TRIGGER',
        issuerId: 2,
        targetIds: [1],
        priority: 2,
        skillRef: { kind: 'extra_passive' },
        triggerSource: 'manual',
        trigger: { source: 'manual', reasons: ['external_state'] },
      },
      ex('nagisa', 220, 20048, [1]),
      ex('discounted-borrow', 301, 1, [-1]),
    ], undefined, 310)

    expect(result.errors).toHaveLength(0)
    expect(result.costHistory[301]).toBe(368_400 - 5 * COST_SCALE)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      effectType: 'CostChange',
      action: 'consumed',
    }))
  })

  it('keeps the critical buff but rejects CostOverload when formation is not full', () => {
    const target = unit(1, 6)
    const selected = [target, unit(2), unit(3), unit(4), nagisa()]
    const result = simulate(selected, [
      ex('nagisa', 300, 20048, [1]),
      ex('no-overload', 381, 1, [-1]),
    ], [1, 2, 3, 4, null, 20048], 400)

    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      frame: 381,
      effectType: 'Special',
      action: 'rejected',
      detail: 'CostOverload:requires_full_formation',
    }))
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      frame: 381,
      effectType: 'Buff',
      action: 'applied',
      targetIds: [1],
    }))
    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 381,
      type: 'COST_EXCEEDED',
    }))
  })

  it('rejects a SPECIAL target because CostOverload can only select a STRIKER', () => {
    const support = unit(2)
    support.SquadType = 'Support'
    const selected = [unit(1), unit(3), unit(4), unit(5), support, nagisa()]
    const result = simulate(selected, [
      ex('invalid-target', 220, 20048, [2]),
    ], undefined, 225)

    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 220,
      issuerId: 20048,
      type: 'INVALID_TARGET',
      message: 'CostOverload target must be a STRIKER',
    }))
    expect(result.actionLogs).toHaveLength(0)
  })

  it('rejects multiple selected targets atomically', () => {
    const selected = [unit(1), unit(2), unit(3), unit(4), unit(5), nagisa()]
    const result = simulate(selected, [
      ex('multiple-targets', 220, 20048, [1, 2]),
    ], undefined, 225)

    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 220,
      issuerId: 20048,
      type: 'INVALID_TARGET',
      message: 'CostOverload requires exactly one target',
    }))
    expect(result.actionLogs).toHaveLength(0)
  })
})

describe('CostOverload data coverage', () => {
  it('registers every EX description containing CostOverload', () => {
    const discovered = Object.values(database)
      .filter(student => [student.Skills.E, ...(student.Skills.E.ExtraSkills ?? [])]
        .some(skill => rules.cost.overloadDescriptionPattern.test(skill.Desc ?? '')))
      .map(student => student.Id)
      .sort((left, right) => left - right)
    expect(discovered).toEqual(Object.keys(rules.cost.rules).map(Number).sort((left, right) => left - right))
  })
})
