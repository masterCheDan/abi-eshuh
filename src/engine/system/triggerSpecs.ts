import type { SkillRef } from '../model/types'
import type { Student } from '../../types/student'
import { triggerSpecsFor, type TriggerSpec } from './ruleManifest'

/**
 * 结构化触发元数据的唯一入口。
 * 数据库没有可靠的 Public 技能触发周期时，不从描述文本猜测；这些技能由用户手动插入。
 */
export type { TriggerSpec } from './ruleManifest'

export function automaticTriggerSpecs(student: Student): Array<TriggerSpec & { mode: 'battle_start'; skillRef: SkillRef }> {
  return triggerSpecsFor(student)
    .filter((spec): spec is TriggerSpec & { mode: 'battle_start'; skillRef: SkillRef } => spec.mode === 'battle_start')
}

/** 显式列出的例外可以在这里扩展，不允许通过自然语言 Desc 推断。 */
export const TRIGGER_SPEC_OVERRIDES: Readonly<Record<number, readonly TriggerSpec[]>> = {}
