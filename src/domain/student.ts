import type { Student } from '../types/student'
import type { PublicSkill } from '../types/student'
import type { SkillDefinition, StudentDefinition, SkillRef } from './types'

const SKILL_SLOT_REFS: ReadonlyArray<{ slot: keyof Student['Skills']; ref: SkillRef }> = [
  { slot: 'E', ref: { kind: 'ex' } },
  { slot: 'P', ref: { kind: 'public' } },
  { slot: 'G', ref: { kind: 'gear_public' } },
  { slot: 'PS', ref: { kind: 'passive' } },
  { slot: 'WP', ref: { kind: 'weapon_passive' } },
  { slot: 'EP', ref: { kind: 'extra_passive' } },
]

/**
 * 把数据层学生转换为领域学生定义。
 * 仅做形状映射，不包含任何规则推导（targeting 由 GameRules 按需填充）。
 */
export function studentDefinition(student: Student): StudentDefinition {
  const skills: SkillDefinition[] = []
  for (const { slot, ref } of SKILL_SLOT_REFS) {
    const skill = student.Skills[slot]
    if (!skill || typeof skill !== 'object') continue
    skills.push({
      ref,
      name: (skill as { Name?: string }).Name ?? '',
      desc: (skill as { Desc?: string }).Desc ?? '',
      cost: Array.isArray((skill as { Cost?: number[] }).Cost) ? (skill as { Cost?: number[] }).Cost! : [],
      duration: (skill as { Duration?: number }).Duration ?? 0,
      effects: (skill as { Effects?: import('../types/student').SkillEffect[] }).Effects ?? [],
    })
    for (const [index, extra] of ((skill as { ExtraSkills?: Array<{ Id?: string; Name?: string; Desc?: string; Cost?: number[]; Duration?: number; Effects?: import('../types/student').SkillEffect[] }> }).ExtraSkills ?? []).entries()) {
      skills.push({
        ref: extra.Id ? { kind: 'extra_ex', extraSkillId: extra.Id } : { kind: 'extra_ex', extraSkillIndex: index },
        name: extra.Name ?? '',
        desc: extra.Desc ?? '',
        cost: extra.Cost ?? [],
        duration: extra.Duration ?? 0,
        effects: extra.Effects ?? [],
      })
    }
  }
  return { id: student.Id, name: student.Name, skills }
}

/**
 * 按爱用品状态选择 NS 技能：
 * gearLevel > 0 且拥有 GearPublic 时使用强化版，否则使用普通 Public。
 */
export function nsSkillFor(student: Student, gearLevel: number = 1): PublicSkill | null {
  return gearLevel > 0 && student.Skills.G ? student.Skills.G : student.Skills.P
}
