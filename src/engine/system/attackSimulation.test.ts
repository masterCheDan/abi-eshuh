import { describe, expect, it } from 'vitest'
import type { Student } from '../../types/student'
import type { SkillBlock, StudentLane } from '../../types/timeline'
import { simulateAttackSegments } from './attackSimulation'

const passive = { Name: '', Desc: '', Parameters: [], Icon: '', Effects: [] }

// enterDur=10, startDur=10, ingDur=10, endDur=10 → oneShot=30, delay=10, reloadDur=20, ammo=2
function fixture(id: number, overrides?: Partial<Student>): Student {
  return {
    Id: id, Name: `S${id}`, Icon: '', School: 'Abydos', SquadType: 'Main', TacticRole: 'DamageDealer', Position: 'Front', StarGrade: 3,
    BulletType: 'Explosion', ArmorType: 'LightArmor', WeaponType: 'AR', Cover: false,
    Street: 0, Outdoor: 0, Indoor: 0, ATK: 100, HP: 100, DEF: 0, HEAL: 0, Dodge: 0, Accuracy: 0, Crit: 0, CritDMG: 0,
    Ammo: 2, AmmoCost: 1, Range: 1, Sight: 1, Regen: 700, Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 10, AttackStartDuration: 10, AttackEndDuration: 10, AttackBurstRoundOverDelay: 10, AttackIngDuration: 10, AttackReloadDuration: 20 } },
      E: { Name: 'EX', Desc: '', Parameters: [], Cost: [0, 0, 0, 0, 0], Duration: 30, Range: 0, Icon: '', Effects: [{ Type: 'Damage', Target: 'Enemy' }] },
      P: { ...passive, Name: 'NS', Duration: 20 },
      G: null,
      PS: { ...passive },
      WP: { ...passive },
      EP: { ...passive },
    },
    Weapon: { ATK: 0, HP: 0, HEAL: 0 },
    HasGear: false,
    ...overrides,
  } as Student
}

function exSkill(studentId: number, startFrame: number, skillDuration?: number): SkillBlock {
  return { type: 'ex', name: 'EX', startFrame, studentId, ...(skillDuration != null ? { skillDuration } : {}) }
}

function lane(student: Student | null, slotIndex = 0, skills: SkillBlock[] = []): StudentLane {
  return { slotIndex, label: `L${slotIndex}`, student, studentId: student?.Id ?? null, skills }
}

describe('simulateAttackSegments', () => {
  it('空位返回空数组', () => {
    expect(simulateAttackSegments(lane(null))).toEqual([])
  })

  it('无技能时产出连续铺满的普攻循环', () => {
    const segs = simulateAttackSegments(lane(fixture(1)), { totalFrames: 130 })
    const summarized = segs.map((s) => [s.type, s.startFrame, s.endFrame, s.index])
    expect(summarized).toEqual([
      ['prepare', 0, 10, 0],
      ['attack', 10, 40, 0],
      ['attack', 50, 80, 1],
      ['reload', 80, 100, 2],
      ['prepare', 100, 110, 0],
      ['attack', 110, 130, 0],
    ])
  })

  it('EX 恰在射击起始帧：该发未打出，子弹不消耗', () => {
    const s = fixture(1)
    const segs = simulateAttackSegments(lane(s, 0, [exSkill(s.Id, 10)]), { totalFrames: 130 })
    expect(segs.some((seg) => seg.type === 'ex' && seg.startFrame === 10)).toBe(true)
    expect(segs.some((seg) => seg.type === 'attack' && seg.startFrame === 10)).toBe(false)
    // 重新准备后，第一发仍以 index 0 打出
    const firstAttack = segs.find((seg) => seg.type === 'attack')
    expect(firstAttack?.index).toBe(0)
    expect(firstAttack?.startFrame).toBeGreaterThan(10)
  })

  it('EX 在射击中途：本次射击视为完成（截断 attack + ex）', () => {
    const s = fixture(1)
    const segs = simulateAttackSegments(lane(s, 0, [exSkill(s.Id, 25)]), { totalFrames: 130 })
    expect(segs).toContainEqual({ startFrame: 10, endFrame: 25, type: 'attack', index: 0 })
    expect(segs.some((seg) => seg.type === 'ex' && seg.startFrame === 25)).toBe(true)
    // 子弹已消耗：下一发 index 为 1
    const attacks = segs.filter((seg) => seg.type === 'attack')
    expect(attacks[1]?.index).toBe(1)
  })

  it('EX 在点射间隔：上一发已完成，其后重新准备', () => {
    const s = fixture(1)
    const segs = simulateAttackSegments(lane(s, 0, [exSkill(s.Id, 45)]), { totalFrames: 130 })
    expect(segs).toContainEqual({ startFrame: 10, endFrame: 40, type: 'attack', index: 0 })
    expect(segs.some((seg) => seg.type === 'ex' && seg.startFrame === 45)).toBe(true)
  })

  it('EX 在换弹中：换弹第 0 帧弹匣已补满，下一弹匣序号从 0 起', () => {
    const s = fixture(1)
    const segs = simulateAttackSegments(lane(s, 0, [exSkill(s.Id, 85)]), { totalFrames: 130 })
    expect(segs).toContainEqual({ startFrame: 80, endFrame: 85, type: 'reload', index: 2 })
    expect(segs.some((seg) => seg.type === 'ex' && seg.startFrame === 85)).toBe(true)
    // 换弹被打断但弹匣已满：重新准备后的第一发 index 为 0
    const attacksAfter = segs.filter((seg) => seg.type === 'attack' && seg.startFrame > 85)
    expect(attacksAfter[0]?.index).toBe(0)
  })
})
