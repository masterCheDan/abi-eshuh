import type { SkillRef } from '../types'
import type { Student } from '../../types/student'
import { triggerSpecsFor, type TriggerSpec } from './ruleManifest'

/**
 * 结构化触发元数据的唯一入口。
 * 数据库没有可靠的 Public 技能触发周期时，不从描述文本猜测；这些技能由用户手动插入。
 */
export type { TriggerSpec } from './ruleManifest'

export function automaticTriggerSpecs(student: Student, gearLevel = 1): Array<TriggerSpec & { mode: 'battle_start'; skillRef: SkillRef }> {
  return triggerSpecsFor(student, gearLevel)
    .filter((spec): spec is TriggerSpec & { mode: 'battle_start'; skillRef: SkillRef } => spec.mode === 'battle_start')
}

// Opening exceptions live in catalog.opening; do not introduce another registry here.
