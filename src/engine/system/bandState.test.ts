import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine } from '../core/simulationEngine'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

function fixture(id: number, name = `S${id}`): Student {
  const passive = { Name: '', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id, Name: name, Icon: '', School: 'Abydos', SquadType: 'Main', TacticRole: 'DamageDealer', Position: 'Front', StarGrade: 3,
    BulletType: 'Explosion', ArmorType: 'LightArmor', WeaponType: 'AR', Cover: false,
    Street: 0, Outdoor: 0, Indoor: 0, ATK: 100, HP: 100, DEF: 0, HEAL: 0, Dodge: 0, Accuracy: 0, Crit: 0, CritDMG: 0,
    Ammo: 1, AmmoCost: 1, Range: 1, Sight: 1, Regen: 700, Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 0, AttackStartDuration: 0, AttackEndDuration: 0, AttackBurstRoundOverDelay: 0, AttackIngDuration: 0, AttackReloadDuration: 0 } },
      E: { Name: 'EX', Desc: '', Parameters: [], Cost: [0, 0, 0, 0, 0], Duration: 1, Range: 0, Icon: '', Effects: [{ Type: 'Damage', Target: 'Enemy' }] },
      P: { ...passive }, G: null, PS: { ...passive }, WP: { ...passive }, EP: { ...passive },
    }, Weapon: { ATK: 0, HP: 0, HEAL: 0 }, HasGear: false,
  } as unknown as Student
}

/** 真实数据副本：EX 零费用、动画 1 帧，便于在测试早期连续施放。 */
function bandCopy(id: number): Student {
  const student = database[String(id)] as Student
  return {
    ...student,
    Skills: {
      ...student.Skills,
      E: { ...student.Skills.E, Cost: [0, 0, 0, 0, 0], Duration: 1 },
    },
  } as unknown as Student
}

function run(students: Student[], ids: number[], intents: Intent[], maxFrame = 1500, exLevel = 5) {
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    {
      mode: 'normal',
      slots: ids,
      skillLevels: ids.map(() => exLevel),
      gearLevels: ids.map(() => 1),
      publicSkillLevels: ids.map(() => 5),
      passiveSkillLevels: ids.map(() => 10),
    },
    new Map(students.map(student => [student.Id, student])),
  )
  return engine.simulate(intents)
}

const ex = (id: string, frame: number, issuerId: number): Intent => ({
  id, frame, issuerId, type: 'EX_CAST', targetIds: [issuerId], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual',
})
const ns = (id: string, frame: number, issuerId: number, ref: Intent['skillRef']): Intent => ({
  id, frame, issuerId, type: 'NS_TRIGGER', targetIds: [issuerId], priority: 2, skillRef: ref, triggerSource: 'manual',
  trigger: { source: 'manual', reasons: ['action_event'] },
})
const ss = (id: string, frame: number, issuerId: number): Intent => ({
  id, frame, issuerId, type: 'SS_TRIGGER', targetIds: [issuerId], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual',
})

describe('乐队状态数据（CH0220_Public 施放源）', () => {
  it.each(Object.entries(rules.catalog.band.exGrants).flatMap(([id, values]) => {
    const expectedAt = (level: number) => values[0][level - 1] ?? values[0].at(-1)
    // Constant rows only need their endpoints. Keep both sides of each value transition.
    return [1, 2, 3, 4, 5].filter(level => level === 1 || level === 5
      || expectedAt(level) !== expectedAt(level - 1)
      || expectedAt(level) !== expectedAt(level + 1))
      .map(level => ({ id: Number(id), level, expected: expectedAt(level) }))
  }))('$id Lv$level grants layers at a level boundary', ({ id, level, expected }) => {
    const result = run([bandCopy(id), fixture(1)], [id, 1], [ex('grant', 0, id)], 100, level)
    expect(result.errors).toEqual([])
    expect(result.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(expected)
  })

  it('4 个乐队 EX 含按等级层数的 Special 效果', () => {
    const expected: Record<string, number[][]> = {
      '10091': [[1, 1, 1, 1, 2]],
      '10092': [[5]],
      '10120': [[2]],
      '16015': [[1]],
    }
    for (const [id, value] of Object.entries(expected)) {
      const special = (database[id] as Student).Skills.E.Effects.find(effect => effect.Key === 'CH0220_Public')
      expect(special).toMatchObject({ Type: 'Special', Target: 'Self', Key: 'CH0220_Public' })
      expect(special?.Value).toEqual(value)
    }
  })
})

describe('乐队层数运行时', () => {
  it('10091 Lv5 EX 两次施放封顶 2 层', () => {
    const result = run([bandCopy(10091), fixture(1)], [10091, 1], [
      ex('a', 0, 10091),
      ex('b', 10, 10091),
    ])
    expect(result.errors).toEqual([])
    expect(result.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(2)
  })

  it('10092 一次获得 5 层并封顶', () => {
    const result = run([bandCopy(10092), fixture(1)], [10092, 1], [
      ex('a', 0, 10092),
      ex('b', 10, 10092),
    ], 100)
    expect(result.errors).toEqual([])
    expect(result.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(5)
  })

  it('10092 每 10 秒移除 1 层直至 0', () => {
    const cast = [ex('a', 0, 10092)]
    const at350 = run([bandCopy(10092), fixture(1)], [10092, 1], cast, 350)
    expect(at350.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(4)
    const at950 = run([bandCopy(10092), fixture(1)], [10092, 1], cast, 950)
    expect(at950.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(2)
    const at1700 = run([bandCopy(10092), fixture(1)], [10092, 1], cast, 1700)
    expect(at1700.finalRuntimes.get(0)?.specialStacks.CH0220_Public).toBe(0)
  })
})

describe('乐队层数消费', () => {
  it('10092 NS 伤害按全队层数×5% 放大（上限 8 层）', () => {
    const result = run(
      [bandCopy(10092), bandCopy(10091), bandCopy(16015), fixture(1)],
      [10092, 10091, 16015, 1],
      [
        ex('a', 0, 10092),
        ex('b', 10, 10091),
        ex('c', 20, 16015),
        ns('n', 30, 10092, { kind: 'public' }),
      ],
    )
    expect(result.errors).toEqual([])
    // 5 + 2 + 1 = 8 层 → ×1.4；Lv5 Scale[0]=68656 → 96118.4
    expect(result.effectAudit.some(record =>
      record.effectType === 'Damage' && record.action === 'applied' && Math.abs((record.value ?? 0) - 96118.4) < 0.01)).toBe(true)
  })

  it('10091 EP 伤害按自身层数倍率（2 层 → ×2）', () => {
    const result = run(
      [bandCopy(10091), fixture(1)],
      [10091, 1],
      [
        ex('a', 0, 10091),
        ss('e', 10, 10091),
      ],
    )
    expect(result.errors).toEqual([])
    // Lv10 Scale=1068 × 2 层
    expect(result.effectAudit.some(record =>
      record.effectType === 'Damage' && record.action === 'applied' && record.value === 2136)).toBe(true)
  })

  it('全队累计 6 层后夏获得 CH0221，10120 EP 按 CH0221 层数选行', () => {
    const result = run(
      [bandCopy(10120), bandCopy(10092)],
      [10120, 10092],
      [
        ex('a', 0, 10092),
        ex('b', 10, 10120),
        ss('e', 20, 10120),
      ],
    )
    expect(result.errors).toEqual([])
    expect(result.finalRuntimes.get(0)?.specialStacks.CH0221_ExtraPassive).toBe(1)
    // 5 行中的行 1（Lv10 = -750）
    expect(result.effectAudit.some(record =>
      record.effectType === 'Buff' && record.stat === 'AttackPower_Coefficient' && record.action === 'applied' && record.value === -750)).toBe(true)
  })
})
