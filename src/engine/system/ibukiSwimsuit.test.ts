import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine } from '../core/simulationEngine'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

function fixture(id: number): Student {
  const passive = { Name: 'passive', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id, Name: `S${id}`, Icon: '', School: 'Abydos', SquadType: 'Main', TacticRole: 'DamageDealer', Position: 'Front', StarGrade: 3,
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

function run(ids: number[], intents: Intent[], maxFrame = 1500) {
  const students = new Map(ids.map(id => [id, id === 20060 ? database['20060'] as Student : fixture(id)]))
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

const cast = (id: string, frame: number, issuerId: number, targetIds: number[] = [-1]): Intent => ({
  id, frame, issuerId, type: 'EX_CAST', targetIds, priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual',
})

const FRIEND_CASTS = (): Intent[] => [
  cast('f1', 10, 1),
  cast('f2', 20, 2),
  cast('f3', 30, 3),
  cast('f1b', 40, 1),
  cast('f2b', 50, 2),
  cast('f3b', 60, 3),
]

describe('friend-marker 机制（伊吹泳装 20060）', () => {
  it('registers 20060 as a friend-marker mechanic driven by config', () => {
    const mechanic = rules.mechanics.cardMechanic(20060)
    expect(mechanic).toMatchObject({
      kind: 'friend-marker',
      minTargets: 1,
      maxTargets: 2,
      targetSquadType: 'Main',
      buffStat: 'CriticalDamageRate_Coefficient',
    })
    if (mechanic?.kind === 'friend-marker') {
      expect(mechanic.counter).toEqual({ gainPerEx: 3, threshold: 12, baseValueRowIndex: 0, activeValueRowIndex: 1 })
    }
  })

  it('keeps the stray CritDmg buff out of the base EX and inside the transform skill', () => {
    const ibuki = database['20060'] as Student
    const base = ibuki.Skills.E
    expect(base.Effects.some(effect => effect.Type === 'Buff' && effect.Stat === 'CriticalDamageRate_Coefficient')).toBe(false)
    const transform = (base.ExtraSkills ?? []).find(extra => extra.Id === 'CH0347Ex02')
    expect(transform).toBeDefined()
    const crit = transform?.Effects.filter(effect => effect.Type === 'Buff' && effect.Stat === 'CriticalDamageRate_Coefficient')
    expect(crit).toHaveLength(1)
    expect(crit?.[0]?.Value).toHaveLength(2)
  })

  it('requires 1-2 Main striker targets for the first cast', () => {
    const ids = [1, 2, 3, 4, 20060]
    expect(run(ids, [cast('a', 0, 20060, [])]).errors).toContainEqual(expect.objectContaining({ type: 'INVALID_TARGET' }))
    expect(run(ids, [cast('a', 0, 20060, [1, 2, 3])]).errors).toContainEqual(expect.objectContaining({ type: 'INVALID_TARGET' }))
    expect(run(ids, [cast('a', 0, 20060, [1, 2])]).errors).toEqual([])
    expect(run(ids, [cast('a', 0, 20060, [1])]).errors).toEqual([])
  })

  it('marks friends, suppresses the stray base buff, redirects transformed casts, and accrues to active', () => {
    const ids = [1, 2, 3, 4, 20060]
    const result = run(ids, [
      cast('ibuki-base', 0, 20060, [1, 2]),
      ...FRIEND_CASTS(),
      cast('ibuki-transformed', 1300, 20060, [20060]),
    ])
    expect(result.errors).toEqual([])

    // 基础施放不产生错位的暴伤 Buff
    expect(result.effectAudit.some(record => record.effectType === 'Buff' && record.stat === 'CriticalDamageRate_Coefficient' && record.action === 'applied' && record.frame === 0)).toBe(false)

    // 计数 3/6/9/12 → 激活（开花），激活后不再累加
    const counts = result.effectAudit.filter(record => record.detail?.startsWith('marker_count:')).map(record => record.detail)
    expect(counts).toEqual(['marker_count:3', 'marker_count:6', 'marker_count:9', 'marker_count:12'])
    expect(result.effectAudit.some(record => record.detail === 'marker_active')).toBe(true)
    expect(result.effectAudit.some(record => record.detail === 'marker_count:15')).toBe(false)

    // 变形施放：仅作用于两名好友，激活时取 ×1.2 数值行
    const buffs = result.effectAudit.filter(record => record.effectType === 'Buff' && record.stat === 'CriticalDamageRate_Coefficient' && record.action === 'applied' && record.frame === 1300)
    expect(buffs.map(record => record.targetIds[0]).sort()).toEqual([1, 2])
    expect(buffs.every(record => record.value === 7286.4)).toBe(true)
  })

  it('uses the base buff row before activation', () => {
    const ids = [1, 2, 3, 4, 20060]
    const result = run(ids, [
      cast('ibuki-base', 0, 20060, [1, 2]),
      cast('f1', 10, 1),
      cast('ibuki-transformed', 1300, 20060, [20060]),
    ])
    expect(result.errors).toEqual([])
    const buffs = result.effectAudit.filter(record => record.effectType === 'Buff' && record.stat === 'CriticalDamageRate_Coefficient' && record.action === 'applied' && record.frame === 1300)
    expect(buffs.map(record => record.targetIds[0]).sort()).toEqual([1, 2])
    expect(buffs.every(record => record.value === 6072)).toBe(true)
  })

  it('redirects a Rio copy of the transformed Ibuki EX to the marked friends', () => {
    const ids = [1, 2, 3, 20041, 20060]
    const result = run(ids, [
      cast('ibuki-base', 0, 20060, [1, 2]),
      cast('rio-copy-init', 100, 20041, [20060]),
      cast('rio-copy-cast', 400, 20041, [20060]),
    ])
    expect(result.errors).toEqual([])
    const buffs = result.effectAudit.filter(record =>
      record.effectType === 'Buff'
      && record.stat === 'CriticalDamageRate_Coefficient'
      && record.action === 'applied'
      && record.frame === 400)
    expect(buffs.map(record => record.targetIds[0]).sort()).toEqual([1, 2])
  })

  it('allows a Rio copy of the base Ibuki EX before the first friend-marking cast', () => {
    const ids = [1, 2, 3, 20041, 20060]
    const result = run(ids, [
      cast('rio-copy-init', 100, 20041, [20060]),
      cast('rio-copy-cast', 400, 20041, [20060]),
    ])
    expect(result.errors).toEqual([])
  })

  it('does not accrue shells when Rio casts a copied friend EX', () => {
    const ids = [1, 2, 20041, 20060]
    const result = run(ids, [
      cast('ibuki-base', 0, 20060, [1, 2]),
      cast('friend', 10, 1),
      cast('rio-copy-init', 100, 20041, [1]),
      cast('rio-copy-cast', 400, 20041, [1]),
    ])
    const counts = result.effectAudit
      .filter(record => record.detail?.startsWith('marker_count:'))
      .map(record => record.detail)
    expect(counts).toEqual(['marker_count:3'])
  })

  it('registers every EX whose description contains the friend/shell mechanic', () => {
    const pattern = /好朋友|贝壳/
    const discovered = new Set<number>()
    for (const student of Object.values(database)) {
      const ex = student.Skills.E
      if (ex?.Desc && pattern.test(ex.Desc)) discovered.add(student.Id)
    }
    const registered = rules.mechanics.cardMechanics
      .filter(mechanic => mechanic.kind === 'friend-marker')
      .map(mechanic => mechanic.studentId)
      .sort((left, right) => left - right)
    expect([...discovered].sort((left, right) => left - right)).toEqual(registered)
  })
})
