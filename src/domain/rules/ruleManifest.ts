/**
 * 受版本控制的学生规则入口。这里永远不读取 Desc；数据不足的能力以
 * explicit manual 规则登记，防止调度器把外部战况误判为确定事件。
 */
import { catalog, specialPolicies, registeredManualReasons } from './catalog'
import type { SkillRef } from '../types'
import type { SkillEffect, Student } from '../../types/student'

export type TriggerMode = 'battle_start' | 'manual'
export interface TriggerSpec {
  mode: TriggerMode
  skillRef: SkillRef
  reasons?: readonly string[]
  /** Only these source effects belong to the opening clause. Omitted means all. */
  effectIndices?: readonly number[]
  /** Structured effects missing from the source Effects array. */
  syntheticEffects?: readonly SkillEffect[]
  /** Direct Cost grant; distinct from CostChange and indexed by NS level. */
  initialCostByLevel?: readonly number[]
}

const BATTLE_START_EP_IDS = new Set<number>(catalog.opening.epIds)
export const SELF_EX_BUFF_EP_IDS: ReadonlySet<number> = new Set(catalog.opening.selfExEpIds)
type OpeningRule = Pick<TriggerSpec, 'effectIndices' | 'syntheticEffects' | 'initialCostByLevel'>
const BATTLE_START_PUBLIC_RULES: Readonly<Record<number, OpeningRule & { kind: 'public' | 'gear_public' }>> = catalog.opening.public as Record<number, OpeningRule & { kind: 'public' | 'gear_public' }>
const BATTLE_START_EP_OVERRIDES: Readonly<Record<number, OpeningRule>> = catalog.opening.overrides

export function triggerSpecsFor(student: Student, gearLevel = 1): readonly TriggerSpec[] {
  const specs: TriggerSpec[] = [
    { mode: 'battle_start', skillRef: { kind: 'passive' } },
    { mode: 'battle_start', skillRef: { kind: 'weapon_passive' } },
  ]
  const publicReasons = registeredManualReasons(student.Id, 'P')
  const epReasons = registeredManualReasons(student.Id, 'EP')
  if (publicReasons) specs.push({ mode: 'manual', skillRef: { kind: 'public' }, reasons: publicReasons })
  if (epReasons) specs.push({ mode: 'manual', skillRef: { kind: 'extra_passive' }, reasons: epReasons })
  if (gearLevel > 0 && student.HasGear && student.Skills.G) {
    const reasons = registeredManualReasons(student.Id, 'G')
    if (reasons) specs.push({ mode: 'manual', skillRef: { kind: 'gear_public' }, reasons })
  }
  const publicRule = BATTLE_START_PUBLIC_RULES[student.Id]
  if (publicRule) {
    const { kind, ...rule } = publicRule
    // 爱用品开场（如爱丽丝“入场充能”）仅在装备爱用品时存在。
    if (kind !== 'gear_public' || gearLevel > 0) {
      specs.push({ mode: 'battle_start', skillRef: { kind }, ...rule })
    }
  }
  if (BATTLE_START_EP_IDS.has(student.Id)) {
    specs.push({ mode: 'battle_start', skillRef: { kind: 'extra_passive' }, ...BATTLE_START_EP_OVERRIDES[student.Id] })
  }
  for (const [extraSkillIndex, extra] of (student.Skills.E.ExtraSkills ?? []).entries()) {
    const reasons = registeredManualReasons(student.Id, `E.ExtraSkills[${extraSkillIndex}]`)
    if (reasons) specs.push({ mode: 'manual', skillRef: extra.Id ? { kind: 'extra_ex', extraSkillId: extra.Id } : { kind: 'extra_ex', extraSkillIndex }, reasons })
  }
  return specs
}

export const SPECIAL_RULES = specialPolicies
export const STAT_POLICY: ReadonlySet<string> = new Set(Object.keys(catalog.policies.stats))
export const DISPEL_RULES: Readonly<Record<string, readonly string[]>> = { default: catalog.dispel.default.removeTypes }
