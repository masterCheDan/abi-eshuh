import { describe, expect, it } from 'vitest'
import type { Student } from '../../types/student'
import { SimulationEngine } from './simulationEngine'
import type { Formation, Intent } from '../model/types'
import { COST_SCALE } from '../system/costSystem'

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
  it('adds 0.5 max Cost for each unique-weapon-4 SPECIAL and ignores STRIKER', () => {
    const striker = student(1)
    const supportA = student(2)
    const supportB = student(3)
    supportA.SquadType = 'Support'
    supportB.SquadType = 'Support'
    supportA.Regen = COST_SCALE
    supportB.Regen = COST_SCALE

    const formation: Formation = {
      mode: 'normal',
      slots: [striker.Id, supportA.Id, supportB.Id],
      uniqueWeaponLevels: [4, 4, 4],
    }
    const instance = new SimulationEngine()
    instance.loadBattle(
      { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 20 },
      formation,
      new Map([striker, supportA, supportB].map(unit => [unit.Id, unit])),
    )

    const result = instance.simulate([])
    expect(result.maxCost).toBe(11 * COST_SCALE)
    expect(result.costHistory.at(-1)).toBe(11 * COST_SCALE)
  })

  it('uses 20 base Cost in restriction release and stacks four SPECIAL bonuses to 22', () => {
    const supports = [1, 2, 3, 4].map((id) => {
      const unit = student(id)
      unit.SquadType = 'Support'
      return unit
    })
    const instance = new SimulationEngine()
    instance.loadBattle(
      { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 0 },
      {
        mode: 'total_assault',
        slots: supports.map(unit => unit.Id),
        uniqueWeaponLevels: [4, 4, 4, 4],
      },
      new Map(supports.map(unit => [unit.Id, unit])),
    )
    expect(instance.simulate([]).maxCost).toBe(22 * COST_SCALE)
  })

  it('activates the weapon passive only from unique weapon level 2', () => {
    const unit = student(1)
    unit.Skills.WP.Effects = [{
      Type: 'Buff',
      Target: 'Self',
      Stat: 'AttackPower_Base',
      Value: [[100]],
    }]
    const simulateAt = (uniqueWeaponLevel: number) => {
      const instance = new SimulationEngine()
      instance.loadBattle(
        { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 0 },
        { mode: 'normal', slots: [unit.Id], uniqueWeaponLevels: [uniqueWeaponLevel] },
        new Map([[unit.Id, unit]]),
      )
      return instance.simulate([])
    }

    expect(simulateAt(1).effectAudit.some(record => record.skillRef.kind === 'weapon_passive')).toBe(false)
    expect(simulateAt(2).effectAudit).toContainEqual(expect.objectContaining({
      skillRef: { kind: 'weapon_passive' },
      action: 'applied',
    }))
  })

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

  it('uses a real hand and draw pile instead of discarding cards left of the cast card', () => {
    const units = [1, 2, 3, 4, 5, 6].map(id => student(id, { cost: 0, duration: 0 }))
    const instance = new SimulationEngine()
    instance.loadBattle(
      { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 3 },
      { mode: 'normal', slots: units.map(unit => unit.Id), deckOrder: [0, 1, 2, 3, 4, 5] },
      new Map(units.map(unit => [unit.Id, unit])),
    )
    const result = instance.simulate([
      { id: 'third-card', frame: 0, type: 'EX_CAST', issuerId: 3, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
      { id: 'drawn-card', frame: 1, type: 'EX_CAST', issuerId: 4, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
      { id: 'still-queued', frame: 2, type: 'EX_CAST', issuerId: 6, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])

    expect(result.actionLogs).toHaveLength(2)
    expect(result.errors).toContainEqual(expect.objectContaining({ frame: 2, type: 'OUT_OF_WINDOW' }))
    expect(result.window?.hand.map(card => card.slotIndex)).toEqual([0, 1, 4])
    expect(result.window?.drawPile.map(card => card.slotIndex)).toEqual([5, 2, 3])
  })

  it('applies and consumes a one-use CostChange on the next successful EX', () => {
    const caster = student(1, { cost: 3 })
    const support = student(2, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'BaseAmount', Uses: 1, Scale: [-1] }],
    })
    const result = engine([caster, support]).simulate([
      { id: 'discount', frame: 0, type: 'SS_TRIGGER', issuerId: 2, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'cast', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])
    expect(result.errors).toHaveLength(0)
    expect(result.effectAudit.some(record => record.effectType === 'CostChange' && record.action === 'consumed')).toBe(true)
    expect(result.costHistory[700]).toBe(1_400 * 701 - 2 * 300_000)
  })

  it('applies a coefficient CostChange for its configured number of uses', () => {
    const caster = student(1, { cost: 5 })
    const support = student(2, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'Coefficient', Uses: 2, Scale: [-5000] }],
    })
    const filler = student(3)
    const result = engine([caster, support, filler]).simulate([
      { id: 'discount', frame: 0, type: 'SS_TRIGGER', issuerId: 2, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'cast-1', frame: 500, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
      { id: 'cast-2', frame: 1000, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])

    expect(result.errors).toHaveLength(0)
    expect(result.costHistory[500]).toBe(2_100 * 501 - 3 * 300_000)
    expect(result.costHistory[1000]).toBe(2_100 * 1001 - 6 * 300_000)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      effectType: 'CostChange',
      action: 'applied',
      valueType: 'Coefficient',
      uses: 2,
    }))
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      effectType: 'CostChange',
      action: 'used',
      uses: 1,
    }))
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      effectType: 'CostChange',
      action: 'consumed',
      uses: 0,
    }))
  })

  it('replaces an existing CostChange instead of stacking it', () => {
    const caster = student(1, { cost: 5 })
    const fixedSupport = student(2, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'BaseAmount', Uses: 1, Scale: [-1] }],
    })
    const percentSupport = student(3, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'Coefficient', Uses: 1, Scale: [-5000] }],
    })
    const result = engine([caster, fixedSupport, percentSupport]).simulate([
      { id: 'fixed', frame: 0, type: 'SS_TRIGGER', issuerId: 2, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'percent', frame: 100, type: 'SS_TRIGGER', issuerId: 3, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'cast', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])

    expect(result.errors).toHaveLength(0)
    expect(result.costHistory[700]).toBe(2_100 * 701 - 3 * 300_000)
    expect(result.effectAudit).toContainEqual(expect.objectContaining({
      effectType: 'CostChange',
      action: 'replaced',
      value: -1,
    }))
  })

  it('does not spend a CostChange use when the discounted EX is rejected', () => {
    const caster = student(1, { cost: 5 })
    const support = student(2, {
      epEffects: [{ Type: 'CostChange', Target: 'Ally', ValueType: 'Coefficient', Uses: 2, Scale: [-5000] }],
    })
    const result = engine([caster, support]).simulate([
      { id: 'discount', frame: 0, type: 'SS_TRIGGER', issuerId: 2, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'too-early', frame: 100, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
      { id: 'success', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' },
    ])

    expect(result.errors).toContainEqual(expect.objectContaining({
      frame: 100,
      type: 'COST_EXCEEDED',
    }))
    expect(result.effectAudit.filter(record => record.effectType === 'CostChange' && record.action === 'used')).toEqual([
      expect.objectContaining({ frame: 700, uses: 1 }),
    ])
    expect(result.effectAudit.some(record => record.effectType === 'CostChange' && record.action === 'consumed')).toBe(false)
  })

  it('audits every supported student effect category deterministically', () => {
    const effectTypes = ['Buff', 'Damage', 'Heal', 'CrowdControl', 'DamageDebuff', 'Regen', 'Summon', 'Special', 'Shield', 'CostChange', 'Dispel', 'Knockback', 'ConcentratedTarget', 'Accumulation']
    const unit = student(1, {
      epEffects: effectTypes.map(Type => ({ Type, Target: 'Self', Key: Type, Uses: 1, Scale: [1], Duration: 1000 })),
    })
    const result = engine([unit]).simulate([{ id: 'effects', frame: 0, type: 'SS_TRIGGER', issuerId: 1, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } }])
    expect(new Set(result.effectAudit.filter(record => record.action === 'applied').map(record => record.effectType))).toEqual(new Set(effectTypes))
  })

  it('rejects a conditional duration without an end frame before mutating state', () => {
    const unit = student(1, { epEffects: [{ Type: 'Shield', Target: 'Self', Duration: -1, Scale: [100] }] })
    const result = engine([unit]).simulate([{ id: 'shield', frame: 10, type: 'SS_TRIGGER', issuerId: 1, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['hp_threshold'] } }])
    expect(result.errors.some(error => error.message.includes('end frame'))).toBe(true)
    expect(result.effectAudit.some(record => record.action === 'applied')).toBe(false)
  })

  it('requires FormChange before an extra EX and accepts it after the user-confirmed state exists', () => {
    const unit = student(1, { epEffects: [{ Type: 'Special', Target: 'Self', Key: 'FormChange', Duration: 30000, Value: [[1]] }] })
    unit.Skills.E.ExtraSkills = [{ Id: 'form-ex', Name: 'Form EX', Desc: '', Parameters: [], Cost: [1, 1, 1, 1, 1], Duration: 30, Range: 0, Icon: '', Effects: [{ Type: 'Damage', Target: 'Enemy', Scale: [1] }] }]
    const before = engine([unit]).simulate([{ id: 'blocked', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'extra_ex', extraSkillId: 'form-ex' }, triggerSource: 'manual' }])
    expect(before.errors.some(error => error.message.includes('FormChange'))).toBe(true)
    const after = engine([unit]).simulate([
      { id: 'form', frame: 0, type: 'SS_TRIGGER', issuerId: 1, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
      { id: 'cast', frame: 500, type: 'EX_CAST', issuerId: 1, targetIds: [-1], priority: 1, skillRef: { kind: 'extra_ex', extraSkillId: 'form-ex' }, triggerSource: 'manual' },
    ])
    expect(after.errors).toHaveLength(0)
  })

  it('rejects duplicate targets atomically', () => {
    const unit = student(1, { cost: 3 })
    const result = engine([unit]).simulate([{ id: 'bad-targets', frame: 700, type: 'EX_CAST', issuerId: 1, targetIds: [-1, -1], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual' }])
    expect(result.errors.some(error => error.type === 'INVALID_TARGET')).toBe(true)
    expect(result.costHistory[700]).toBe(700 * 701)
  })

  it('resolves an unannotated offensive NS effect to the enemy, not the event target', () => {
    const unit = student(1)
    unit.Skills.P.Effects = [{ Type: 'Damage', Scale: [100] }]
    const result = engine([unit]).simulate([
      { id: 'ns', frame: 0, type: 'NS_TRIGGER', issuerId: 1, targetIds: [1], priority: 2, skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
    ])
    expect(result.errors).toHaveLength(0)
    expect(result.effectLedger.find(entry => entry.effectType === 'Damage')?.targetId).toBe(-1)
  })

  it('applies RegenCost_Coefficient as a 1/10000 multiplier, not a flat add', () => {
    // 日鞠类效果：目标为全体成员，系数 2000 → +20% 回复力（而非每成员 +2000 平面累加）
    const unit = student(1, {
      epEffects: [{ Type: 'Buff', Target: 'Self', Stat: 'RegenCost_Coefficient', Value: [[2000]], Duration: 5400 }],
    })
    const result = engine([unit]).simulate([
      { id: 'ep', frame: 0, type: 'SS_TRIGGER', issuerId: 1, targetIds: [1], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
    ])
    // 单人队 baseRegen=700，系数 2000 → 每帧回复 700×(1+2000/10000)=840
    // buff 在 frame 0 调度、frame 1 起生效，故首帧仅 baseRegen=700
    expect(result.costHistory[100]).toBe(700 + 840 * 100)
  })

  it('deduplicates a team-wide RegenCost_Coefficient buff instead of summing per target', () => {
    const striker = student(1)
    const support = student(2)
    support.SquadType = 'Support'
    striker.Skills.EP.Effects = [{ Type: 'Buff', Target: ['Self', 'AllyMain', 'AllySupport'], Stat: 'RegenCost_Coefficient', Value: [[2000]], Duration: 5400 }]
    const result = engine([striker, support]).simulate([
      { id: 'ep', frame: 0, type: 'SS_TRIGGER', issuerId: 1, targetIds: [1, 2], priority: 2, skillRef: { kind: 'extra_passive' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] } },
    ])
    // 双人队 baseRegen=1400，系数 2000 只计一次 → 每帧 1400×1.2=1680（若按 target 累加则为 1400+2000×2=5400）
    expect(result.costHistory[50]).toBe(1400 + 1680 * 50)
  })
})
