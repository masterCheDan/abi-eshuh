import { baselineBattle, baselineLanes, baselineSlots } from './fixtures'

export function shareScenario() {
  const battle = baselineBattle()
  const students = [...battle.students.values()]
  students[0].Skills.E.Effects.push({ Type: 'Summon', SummonId: 40015, Duration: 30_000 })
  students[1].HasGear = true
  students[1].Skills.G = { ...students[1].Skills.P, Effects: [{ Type: 'Buff', Target: 'Ally', Stat: 'AttackPower_Base', Value: [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]], Duration: 1_000 }] }
  students[2].SquadType = 'Support'
  const lanes = baselineLanes(students)
  lanes[0].skills.push({ eventId: 'spawn', type: 'ex', name: 'Baseline EX', studentId: students[0].Id, startFrame: 500, targetIds: [students[0].Id], skillRef: { kind: 'ex' }, triggerSource: 'manual', trigger: { source: 'manual' } })
  lanes[1].skills.push({ eventId: 'buff', type: 'ns', name: 'Baseline NS', studentId: students[1].Id, startFrame: 510, targetIds: [students[0].Id], targetSummonIds: ['summon-spawn-40015-0'], skillRef: { kind: 'gear_public' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'], conditionEndFrame: 540 } })
  const slots = baselineSlots(lanes)
  slots[1].gearLevel = 2
  slots[2].uniqueWeaponLevel = 4
  const env = { bossId: 1, difficulty: 5, armorType: 'HeavyArmor', terrain: 2, maxFrame: 950 }
  return { battle, lanes, slots, env, deckOrder: [0, 2, 1] }
}
