import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine } from '../core/simulationEngine'
import { nsSkillFor } from '../../domain/student'

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

function run(
  students: Student[],
  ids: number[],
  intents: Intent[],
  gearLevels: number[],
  maxFrame = 1500,
) {
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    {
      mode: 'normal',
      slots: ids,
      gearLevels,
      publicSkillLevels: ids.map(() => 5),
      passiveSkillLevels: ids.map(() => 10),
    },
    new Map(students.map(student => [student.Id, student])),
  )
  return engine.simulate(intents)
}

const ex = (id: string, frame: number, issuerId: number, targetIds: number[] = [-1]): Intent => ({
  id, frame, issuerId, type: 'EX_CAST', targetIds, priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual',
})

const ns = (id: string, frame: number, issuerId: number, skillRef?: Intent['skillRef']): Intent => ({
  id, frame, issuerId, type: 'NS_TRIGGER', targetIds: [issuerId], priority: 2, ...(skillRef ? { skillRef } : {}), triggerSource: 'manual',
})

describe('爱用品 NS 强化状态', () => {
  it('nsSkillFor 按 gearLevel 选择 Public/GearPublic', () => {
    const aru = database['10000'] as Student
    expect(nsSkillFor(aru, 0)?.Name).toBe('黑色射击')
    expect(nsSkillFor(aru, 1)?.Name).toBe('黑色射击＋')
    expect(nsSkillFor(aru, 2)?.Name).toBe('黑色射击＋')
    const noGear = database['10035'] as Student
    expect(nsSkillFor(noGear, 0)?.Name).toBe(nsSkillFor(noGear, 2)?.Name)
  })

  it('未显式 skillRef 的 NS 按 gearLevel 解析 public/gear_public', () => {
    const aru = database['10000'] as Student
    const ids = [10000, 1]
    const off = run([aru, fixture(1)], ids, [ns('n1', 10, 10000)], [0, 1])
    const on = run([aru, fixture(1)], ids, [ns('n2', 10, 10000)], [1, 1])
    const offValue = off.effectAudit.find(record => record.skillRef.kind === 'public' && record.effectType === 'Damage')?.value ?? 0
    const onValue = on.effectAudit.find(record => record.skillRef.kind === 'gear_public' && record.effectType === 'Damage')?.value ?? 0
    expect(offValue).toBeGreaterThan(0)
    expect(onValue).toBeGreaterThan(offValue)
  })

  it('爱丽丝 10015 入场充能开场仅在装备爱用品时存在', () => {
    const alice = database['10015'] as Student
    const ids = [10015, 1]
    const off = run([alice, fixture(1)], ids, [], [0, 1])
    const on = run([alice, fixture(1)], ids, [], [1, 1])
    const hasOpening = (result: ReturnType<typeof run>) =>
      result.effectAudit.some(record => record.effectType === 'Special' && record.detail?.startsWith('EnergyBatteryHalf'))
    expect(hasOpening(off)).toBe(false)
    expect(hasOpening(on)).toBe(true)
  })
})

describe('强化 NS 多行数值（16009/10043/10091）', () => {
  it('16009 满：忍研人数（不含自身）决定 EP 与强化 NS 的数值行', () => {
    const man = database['16009'] as Student
    const ids = [16009, 16010, 16011, 10000]
    const result = run(
      [man, fixture(16010, '泉奈'), fixture(16011, '月咏'), fixture(10000, '阿露')],
      ids,
      [ns('n1', 10, 16009, { kind: 'gear_public' })],
      [1, 1, 1, 1],
    )
    expect(result.errors).toEqual([])
    // EP（extra_passive，Lv10）取行 2：4788
    expect(result.effectAudit.some(record =>
      record.effectType === 'Buff' && record.stat === 'CriticalDamageRate_Coefficient' && record.action === 'applied' && record.value === 4788)).toBe(true)
    // 强化 NS（gear_public，Lv5）取行 2：6123
    expect(result.effectAudit.some(record =>
      record.effectType === 'Buff' && record.stat === 'AttackPower_Coefficient' && record.action === 'applied' && record.value === 6123)).toBe(true)
  })

  it('10043 若藻（泳装）：NS 按次数取行 0/1/2，第 4 次被拒，public/gear_public 计数共用', () => {
    const wakamo = database['10043'] as Student
    const ids = [10043, 1]
    const result = run(
      [wakamo, fixture(1)],
      ids,
      [
        ns('a', 10, 10043),
        ns('b', 30, 10043, { kind: 'gear_public' }),
        ns('c', 50, 10043),
        ns('d', 70, 10043),
      ],
      [0, 1],
    )
    const values = result.effectAudit
      .filter(record =>
        record.effectType === 'Buff'
        && record.stat === 'AttackPower_Coefficient'
        && record.action === 'applied'
        && (record.skillRef.kind === 'public' || record.skillRef.kind === 'gear_public'))
      .map(record => record.value)
    expect(values).toEqual([2553, 6359, 7039])
    expect(result.errors.some(error => error.frame === 70 && error.type === 'INVALID_CONDITION' && error.message.includes('3 次'))).toBe(true)
  })

  it('10091 和纱（乐队）：强化 NS 按每个目标是否持有 CH0220_Public 分别取行', () => {
    // 乐队 EX 已由数据管线携带 CH0220_Public 施放源。
    const wakana = database['10091'] as Student
    const ids = [10091, 1, 2]
    const result = run(
      [wakana, fixture(1), fixture(2)],
      ids,
      [
        ex('ex1', 500, 10091, [10091]),
        ns('n1', 800, 10091, { kind: 'gear_public' }),
      ],
      [1, 1, 1],
    )
    expect(result.errors).toEqual([])
    const buffs = result.effectAudit.filter(record =>
      record.effectType === 'Buff' && record.stat === 'EnhanceExplosionRate_Base' && record.action === 'applied' && record.frame >= 800)
    const byTarget = new Map(buffs.map(record => [record.targetIds[0], record.value]))
    // 和纱自己有 CH0220_Public → 行 1（Lv5 2954）；队友无状态 → 行 0（Lv5 1368）
    expect(byTarget.get(10091)).toBe(2954)
    expect(byTarget.get(1)).toBe(1368)
    expect(byTarget.get(2)).toBe(1368)
  })
})
