import type { TriggerEvidence, TriggerSource, ManualTriggerReason, SkillRef } from './types'
import type { SkillEffect, Student } from '../types/student'
import { rules } from './rules/GameRules'

const sources = new Set(['manual', 'automatic'])
const reasons = new Set(['chance', 'random_target', 'hp_threshold', 'external_state', 'action_event', 'interval'])
export function normalizeTrigger(input: { trigger?: unknown; triggerSource?: unknown }): { trigger: TriggerEvidence; triggerSource: TriggerSource } | { error: string } {
  const raw = input.trigger
  if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) return { error: '触发事实格式非法' }
  const evidence = raw as Partial<TriggerEvidence> | undefined
  if (input.triggerSource !== undefined && !sources.has(String(input.triggerSource))) return { error: '触发来源非法' }
  if (evidence && !sources.has(String(evidence.source))) return { error: '触发事实缺少合法来源' }
  if (evidence && input.triggerSource != null && input.triggerSource !== evidence.source) return { error: '两个触发来源字段互相矛盾' }
  if (evidence?.reasons != null && (!Array.isArray(evidence.reasons) || evidence.reasons.some(r => !reasons.has(r)))) return { error: '人工确认原因非法' }
  if (evidence?.conditionEndFrame != null && (!Number.isInteger(evidence.conditionEndFrame) || evidence.conditionEndFrame < 0)) return { error: '条件结束帧必须是非负整数' }
  const source = (evidence?.source ?? input.triggerSource ?? 'manual') as TriggerSource
  return { triggerSource: source, trigger: { ...evidence, source } }
}

export function requiredTriggerReasons(effects: readonly SkillEffect[], studentId?: number, ref?: SkillRef): ManualTriggerReason[] {
  const required: ManualTriggerReason[] = []
  if (studentId != null && (ref?.kind === 'public' || ref?.kind === 'gear_public') && rules.nsTrigger.rule(studentId)?.kind === 'attack_count') required.push('action_event')
  if (effects.some(e => e.Chance != null && e.Chance < 10000)) required.push('chance')
  if (effects.some(e => {
    const c = e.Condition as { Type?: string; Parameter?: string } | undefined
    return c?.Type === 'TargetProp' && c.Parameter === 'Size'
  })) required.push('external_state')
  return required
}

/** Eligibility only; does not infer attacks, external HP or delayed retries. */
export function automaticNsError(student: Student, ref: SkillRef, effects: readonly SkillEffect[], gearLevel: number, frame: number): string | null {
  const expected = gearLevel > 0 && student.Skills.G ? 'gear_public' : 'public'
  if (ref.kind !== expected) return '自动触发只支持与当前爱用品匹配的周期 NS；开局和关联 EX 效果由引擎生成'
  const rule = rules.nsTrigger.rule(student.Id)
  if (!rule) return '没有登记该技能的自动触发规则'
  if (rule.kind !== 'interval') return '攻击次数型 NS 需要转为人工确认，不能作为已验证自动事件'
  if (rules.targeting.requiresManualTarget([...effects]) || requiredTriggerReasons(effects).length || effects.some(e => e.Duration != null && e.Duration < 0)) return '该技能需要用户选择目标或确认外部条件'
  const period = rule.seconds * 30
  if (!Number.isInteger(frame) || frame <= 0 || frame % period !== 0) return `自动 NS 应在开战起算的 ${period} 帧周期触发`
  return null
}
