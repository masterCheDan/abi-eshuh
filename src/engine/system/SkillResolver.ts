/**
 * SkillResolver：负责“技能是什么”——SkillRef + Student → ResolvedSkill。
 * 不持有运行时状态，纯粹基于学生定义与等级解析技能形状。
 */
import type { Student } from '../../types/student'
import type { SkillRef } from '../model/types'
import { rules } from '../../domain/rules/GameRules'

export interface ResolvedSkill {
  ref: SkillRef
  name: string
  duration: number
  cost: number
  effects: import('../../types/student').SkillEffect[]
  action: 'EX' | 'NS' | 'SS'
  level: number
}

export interface SkillLevels {
  ex: number
  ns: number
  ss: number
}

function levelInput(levels: number | SkillLevels | undefined): SkillLevels {
  return typeof levels === 'number' ? { ex: levels, ns: 10, ss: 10 } : levels ?? { ex: 5, ns: 10, ss: 10 }
}

export function resolveSkill(student: Student, ref: SkillRef, levels?: number | SkillLevels): ResolvedSkill | null {
  const level = levelInput(levels)
  if (ref.kind === 'ex') return {
    ref,
    name: student.Skills.E.Name,
    duration: student.Skills.E.Duration,
    cost: student.Skills.E.Cost[level.ex - 1] ?? 0,
    effects: rules.cost.applyOverload(student.Id, ref, student.Skills.E.Effects),
    action: 'EX',
    level: level.ex,
  }
  if (ref.kind === 'public' || ref.kind === 'gear_public') {
    const skill = ref.kind === 'gear_public' ? student.Skills.G : student.Skills.P
    return skill ? { ref, name: skill.Name, duration: skill.Duration ?? 60, cost: 0, effects: skill.Effects, action: 'NS', level: level.ns } : null
  }
  if (ref.kind === 'passive' || ref.kind === 'weapon_passive') {
    const skill = ref.kind === 'passive' ? student.Skills.PS : student.Skills.WP
    return { ref, name: skill.Name, duration: 0, cost: 0, effects: skill.Effects, action: 'SS', level: level.ss }
  }
  if (ref.kind === 'extra_passive') return { ref, name: student.Skills.EP.Name, duration: 0, cost: 0, effects: student.Skills.EP.Effects, action: 'SS', level: level.ss }
  const extra = (student.Skills.E.ExtraSkills ?? []).find(s => ref.extraSkillId ? s.Id === ref.extraSkillId : s === student.Skills.E.ExtraSkills?.[ref.extraSkillIndex ?? 0])
  return extra ? { ref, name: extra.Name, duration: extra.Duration, cost: extra.Cost[level.ex - 1] ?? extra.Cost[0] ?? 0, effects: extra.Effects, action: 'EX', level: level.ex } : null
}
