import type { SkillRef } from '../model/types'
import type { Student } from '../../types/student'

/**
 * 结构化触发元数据的唯一入口。
 * 数据库没有可靠的 Public 技能触发周期时，不从描述文本猜测；这些技能由用户手动插入。
 */
export interface TriggerSpec {
  mode: 'battle_start' | 'manual'
  skillRef: SkillRef
}

export function automaticTriggerSpecs(student: Student): TriggerSpec[] {
  const specs: TriggerSpec[] = [
    { mode: 'battle_start', skillRef: { kind: 'passive' } },
    { mode: 'battle_start', skillRef: { kind: 'weapon_passive' } },
  ]
  // 带 Condition 的 EP 依赖外部战况，必须由用户确认触发时机。
  if (!student.Skills.EP.Effects.some(effect => effect.Condition)) {
    specs.push({ mode: 'battle_start', skillRef: { kind: 'extra_passive' } })
  }
  return specs
}

/** 显式列出的例外可以在这里扩展，不允许通过自然语言 Desc 推断。 */
export const TRIGGER_SPEC_OVERRIDES: Readonly<Record<number, readonly TriggerSpec[]>> = {}
