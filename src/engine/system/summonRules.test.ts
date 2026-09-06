import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { SkillEffect, Student, StudentDB } from '../../types/student'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

/** 技能槽位 → SkillRef.kind（ExtraSkills 单独映射为 extra_ex）。 */
const SLOT_KIND: Record<string, string> = {
  E: 'ex',
  P: 'public',
  G: 'gear_public',
  PS: 'passive',
  WP: 'weapon_passive',
  EP: 'extra_passive',
}

function skillVariants(student: Student): Array<{ effects: SkillEffect[]; desc: string; kind: string }> {
  const result: Array<{ effects: SkillEffect[]; desc: string; kind: string }> = []
  for (const [slot, kind] of Object.entries(SLOT_KIND)) {
    const skill = student.Skills[slot as keyof Student['Skills']] as { Effects?: SkillEffect[]; Desc?: string; ExtraSkills?: Array<{ Effects?: SkillEffect[]; Desc?: string }> } | null
    if (!skill || typeof skill !== 'object') continue
    result.push({ effects: skill.Effects ?? [], desc: skill.Desc ?? '', kind })
    for (const extra of skill.ExtraSkills ?? []) result.push({ effects: extra.Effects ?? [], desc: extra.Desc ?? '', kind: 'extra_ex' })
  }
  return result
}

describe('summon rule data coverage', () => {
  it('registers every SummonId present in the student database', () => {
    const discovered = new Set<number>()
    for (const student of Object.values(database)) {
      for (const { effects } of skillVariants(student)) {
        for (const effect of effects) {
          if (effect.Type === 'Summon' && effect.SummonId != null) discovered.add(effect.SummonId)
        }
      }
    }
    expect([...discovered].sort((left, right) => left - right))
      .toEqual(Object.keys(rules.summon.rules).map(Number).sort((left, right) => left - right))
  })

  it('classifies vehicle and cover ids with matching rule kinds', () => {
    for (const id of rules.summon.vehicles) expect(rules.summon.rule(id).kind).toBe('vehicle')
    for (const id of rules.summon.covers) expect(rules.summon.rule(id).kind).toBe('cover')
  })

  it('registers every formation-wide buff whose description mentions summons', () => {
    const discovered = new Set<string>()
    for (const student of Object.values(database)) {
      for (const { effects, desc, kind } of skillVariants(student)) {
        const buffTargetsAlly = effects.some(effect =>
          effect.Type === 'Buff'
          && (Array.isArray(effect.Target)
            ? effect.Target.some(target => target === 'AllyMain' || target === 'AllySupport')
            : effect.Target === 'AllyMain' || effect.Target === 'AllySupport'))
        if (buffTargetsAlly && desc.includes('召唤物')) discovered.add(`${student.Id}:${kind}`)
      }
    }
    expect([...discovered].sort()).toEqual([...rules.summon.allyBuffIncludesSummon].sort())
  })
})
