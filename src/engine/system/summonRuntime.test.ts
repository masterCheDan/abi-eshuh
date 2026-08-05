import { describe, expect, it } from 'vitest'
import type { Student } from '../../types/student'
import type { Intent } from '../model/types'
import { SimulationEngine } from '../core/simulationEngine'

function unit(id: number, effects: Student['Skills']['E']['Effects']): Student {
  const passive = { Name: '', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id, Name: `S${id}`, Icon: '', School: 'Abydos', SquadType: 'Main', TacticRole: 'DamageDealer', Position: 'Front', StarGrade: 3,
    BulletType: 'Explosion', ArmorType: 'LightArmor', WeaponType: 'AR', Cover: false,
    Street: 0, Outdoor: 0, Indoor: 0, ATK: 100, HP: 100, DEF: 0, HEAL: 0, Dodge: 0, Accuracy: 0, Crit: 0, CritDMG: 0,
    Ammo: 1, AmmoCost: 1, Range: 1, Sight: 1, Regen: 700, Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 0, AttackStartDuration: 0, AttackEndDuration: 0, AttackBurstRoundOverDelay: 0, AttackIngDuration: 0, AttackReloadDuration: 0 } },
      E: { Name: 'EX', Desc: '', Parameters: [], Cost: [0, 0, 0, 0, 0], Duration: 1, Range: 0, Icon: '', Effects: effects },
      P: { ...passive }, G: null, PS: { ...passive }, WP: { ...passive }, EP: { ...passive },
    }, Weapon: { ATK: 0, HP: 0, HEAL: 0 }, HasGear: false,
  } as unknown as Student
}

function simulate(students: Student[], intents: Intent[], maxFrame = 90) {
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame },
    { mode: 'normal', slots: students.map(student => student.Id) },
    new Map(students.map(student => [student.Id, student])),
  )
  return engine.simulate(intents)
}

const ex = (id: string, frame: number, issuerId: number): Intent => ({ id, frame, issuerId, type: 'EX_CAST', targetIds: [issuerId], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual', trigger: { source: 'manual' } })

describe('summon runtime instances', () => {
  it('groups a summon\'s stat Effects into exactly one instance', () => {
    const reisa = unit(20051, [
      { Type: 'Summon', SummonId: 40015, Stat: 'MaxHP_Base', Value: [[100]], Duration: 22_000 },
      { Type: 'Summon', SummonId: 40015, Stat: 'AttackPower_Base', Value: [[200]], Duration: 22_000 },
      { Type: 'Summon', SummonId: 40015, Stat: 'HealPower_Base', Value: [[300]], Duration: 22_000 },
    ])
    const result = simulate([reisa], [ex('reisa', 0, reisa.Id)])
    expect(result.finalSummons).toHaveLength(1)
    expect(result.finalSummons[0]).toMatchObject({ summonId: 40015, kind: 'summoned', stats: { MaxHP_Base: 100, AttackPower_Base: 200, HealPower_Base: 300 } })
    expect(result.finalRuntimes.get(0)?.summons).toEqual({ '40015': 1 })
  })

  it('replaces the global vehicle instance when another vehicle is summoned', () => {
    const first = unit(1, [{ Type: 'Summon', SummonId: 30000, Duration: 30_000 }])
    const second = unit(2, [{ Type: 'Summon', SummonId: 30001, Duration: 30_000 }])
    const result = simulate([first, second], [ex('first', 0, 1), ex('second', 2, 2)])
    expect(result.finalSummons).toEqual([expect.objectContaining({ summonId: 30001, kind: 'vehicle', ownerId: 2 })])
    expect(result.effectAudit).toContainEqual(expect.objectContaining({ effectType: 'Summon', action: 'replaced', issuerId: 1 }))
  })

  it('keeps up to five fireworks launchers and rejects the sixth spawn only', () => {
    const haika = unit(10090, [{ Type: 'Summon', SummonId: 40009, Duration: 50_000 }])
    const result = simulate([haika], Array.from({ length: 6 }, (_, index) => ex(`firework-${index}`, index * 2, haika.Id)))
    expect(result.finalSummons).toHaveLength(5)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({ effectType: 'Summon', action: 'rejected', detail: 'summon:40009:max_count:5' }))
    expect(result.errors).toEqual([])
  })

  it('accepts an active summon instance as an ally target and rejects an inactive one', () => {
    const caster = unit(1, [{ Type: 'Summon', SummonId: 40015, Duration: 30_000 }])
    const support = unit(2, [])
    support.Skills.P.Effects = [{ Type: 'Buff', Target: 'Ally', Stat: 'AttackPower_Base', Scale: [100], Duration: 1_000 }]
    const summonTarget = 'summon-spawn-40015-0'
    const result = simulate([caster, support], [
      ex('spawn', 0, caster.Id),
      { id: 'buff-summon', frame: 2, issuerId: support.Id, type: 'NS_TRIGGER', targetIds: [], targetSummonIds: [summonTarget], priority: 2, skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual' } },
      { id: 'bad-summon', frame: 3, issuerId: support.Id, type: 'NS_TRIGGER', targetIds: [], targetSummonIds: ['summon-missing'], priority: 2, skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual' } },
    ])
    expect(result.effectAudit).toContainEqual(expect.objectContaining({ effectType: 'Buff', action: 'applied', targetIds: [summonTarget] }))
    expect(result.errors).toContainEqual(expect.objectContaining({ type: 'INVALID_TARGET', message: expect.stringContaining('not active') }))
  })
})
