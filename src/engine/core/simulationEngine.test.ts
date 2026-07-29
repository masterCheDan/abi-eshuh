import { describe, expect, it } from 'vitest'
import type { Student } from '../../types/student'
import { SimulationEngine } from './simulationEngine'
import type { Intent } from '../model/types'

function student(id: number, options: { cost?: number; duration?: number; epEffects?: Student['Skills']['EP']['Effects'] } = {}): Student {
  const passive = { Name: 'passive', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id, Name: `S${id}`, Icon: '', School: 'Abydos', SquadType: 'Main', TacticRole: 'DamageDealer', Position: 'Front', StarGrade: 3,
    BulletType: 'Explosion', ArmorType: 'LightArmor', WeaponType: 'AR', Cover: false,
    Street: 0, Outdoor: 0, Indoor: 0, ATK: 100, HP: 100, DEF: 0, HEAL: 0, Dodge: 0, Accuracy: 0, Crit: 0, CritDMG: 0,
    Ammo: 1, AmmoCost: 1, Range: 1, Sight: 1, Regen: 700, Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 0, AttackStartDuration: 0, AttackEndDuration: 0, AttackBurstRoundOverDelay: 0, AttackIngDuration: 0, AttackReloadDuration: 0 } },
      E: { Name: 'EX', Desc: '', Parameters: [], Cost: [options.cost ?? 3, options.cost ?? 3, options.cost ?? 3, options.cost ?? 3, options.cost ?? 3], Duration: options.duration ?? 60, Range: 0, Icon: '', Effects: [{ Type: 'Damage', Target: 'Enemy' }] },
      P: { ...passive }, G: null, PS: { ...passive }, WP: { ...passive }, EP: { ...passive, Effects: options.epEffects ?? [] },
    }, Weapon: { ATK: 0, HP: 0, HEAL: 0 }, HasGear: false,
  } as unknown as Student
}

function engine(students: Student[]): SimulationEngine {
  const instance = new SimulationEngine()
  instance.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 1400 },
    { mode: 'normal', slots: students.map(student => student.Id) },
    new Map(students.map(student => [student.Id, student])),
  )
  return instance
}

describe('SimulationEngine deterministic student skills', () => {
  it('does not consume cost when an EX is rejected during another EX', () => {
    const unit = student(1, { duration: 120 })
    const intents: Intent[] = [
      { id: 'first', frame: 1300, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
      { id: 'second', frame: 1301, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ]
    const result = engine([unit]).simulate(intents)
    expect(result.actionLogs).toHaveLength(1)
    expect(result.errors.some(error => error.type === 'COOLDOWN')).toBe(true)
    expect(result.costHistory[1301]).toBe(11_400)
  })

  it('applies and consumes a one-use CostChange on the next successful EX', () => {
    const caster = student(1, { cost: 3 })
    const support = student(2, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'BaseAmount', Uses: 1, Scale: [-1] }],
    })
    const result = engine([caster, support]).simulate([
      { id: 'cast', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])
    expect(result.errors).toHaveLength(0)
    expect(result.effectAudit.some(record => record.effectType === 'CostChange' && record.action === 'consumed')).toBe(true)
    expect(result.costHistory[700]).toBe(1_400 * 701 - 2 * 300_000)
  })

  it('audits every supported student effect category deterministically', () => {
    const effectTypes = ['Buff', 'Damage', 'Heal', 'CrowdControl', 'DamageDebuff', 'Regen', 'Summon', 'Special', 'Shield', 'CostChange', 'Dispel', 'Knockback', 'ConcentratedTarget', 'Accumulation']
    const unit = student(1, {
      epEffects: effectTypes.map(Type => ({ Type, Target: 'Self', Key: Type, Uses: 1, Scale: [1], Duration: 1000 })),
    })
    const result = engine([unit]).simulate([])
    expect(new Set(result.effectAudit.filter(record => record.action === 'applied').map(record => record.effectType))).toEqual(new Set(effectTypes))
  })
})
