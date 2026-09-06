/**
 * SkillViewService：UI 只读消费技能视图的入口。
 *
 * UI 不再直接推导“为什么这个技能只能选一个 Ally / 能否选 Boss / Cost 是否变化”，
 * 只通过本服务拿到渲染与目标选择所需的信息。
 */
import type { Student } from '../types/student'
import type { SquadSlot } from '../types/squad'
import type { SkillRef } from './types'
import { rules } from './rules/GameRules'
import type { TargetSpec } from './types'

export interface TargetOptionView {
  id: number
  label: string
}

export interface SkillView {
  name: string
  icon: string
  /** 当前等级基础 Cost。 */
  cost: number
  duration: number
  targeting: TargetSpec
  availableTargets: TargetOptionView[]
  isManualTarget: boolean
  /** 可选的 UI 提示文案（机制驱动，如好友选择说明）。 */
  hint?: string
}

function squadTargetOptions(
  squad: SquadSlot[],
  options: { mainOnly?: boolean; includeEnemy?: boolean },
  enemyLabel: string,
): TargetOptionView[] {
  const allies = squad
    .filter(slot => slot.student && (!options.mainOnly || slot.slotType === 'Main'))
    .map(slot => ({ id: slot.student!.Id, label: slot.student!.Name }))
  return options.includeEnemy ? [...allies, { id: -1, label: enemyLabel }] : allies
}

function targetingSpec(policy: ReturnType<typeof rules.targeting.policy>, overload: boolean): TargetSpec {
  return {
    policy,
    ...(overload ? { squadType: 'Main' as const } : {}),
    ...(overload ? { max: 1 } : {}),
    canTargetEnemy: policy === 'select-any' || policy === 'mixed',
  }
}

/** EX（含 extra_ex）技能视图。 */
export function getExSkillView(
  student: Student,
  squad: SquadSlot[],
  ref: SkillRef,
  exLevel: number,
  enemyLabel: string,
): SkillView | null {
  if (ref.kind === 'extra_ex') {
    const extras = student.Skills.E.ExtraSkills ?? []
    const extra = extras.find(skill => ref.extraSkillId ? skill.Id === ref.extraSkillId : skill === extras[ref.extraSkillIndex ?? 0])
    if (!extra) return null
    const policy = rules.targeting.policy(extra.Effects)
    return {
      name: extra.Name,
      icon: extra.Icon,
      cost: extra.Cost[exLevel - 1] ?? extra.Cost[0] ?? 0,
      duration: extra.Duration,
      targeting: targetingSpec(policy, false),
      availableTargets: squadTargetOptions(squad, { includeEnemy: policy === 'select-any' || policy === 'mixed' }, enemyLabel),
      isManualTarget: rules.targeting.requiresManualTarget(extra.Effects),
    }
  }
  if (ref.kind !== 'ex') return null
  const ex = student.Skills.E
  const mechanic = rules.mechanics.cardMechanic(student.Id)
  if (mechanic?.kind === 'friend-marker') {
    const squadTypeLabel = mechanic.targetSquadType === 'Main' ? '前锋' : '支援'
    return {
      name: ex.Name,
      icon: ex.Icon,
      cost: ex.Cost[exLevel - 1] ?? ex.Cost[0] ?? 0,
      duration: ex.Duration,
      targeting: {
        policy: 'select-ally',
        min: mechanic.minTargets,
        max: mechanic.maxTargets,
        squadType: mechanic.targetSquadType,
        canTargetEnemy: false,
      },
      availableTargets: squadTargetOptions(squad, { mainOnly: mechanic.targetSquadType === 'Main', includeEnemy: false }, enemyLabel),
      isManualTarget: true,
      // 提供给 UI 的说明文案（后续可迁移到 i18n）。
      hint: `选择 ${mechanic.minTargets}-${mechanic.maxTargets} 名${squadTypeLabel}作为「好朋友」（整局固定）`,
    }
  }
  const overload = rules.cost.overloadRule(student.Id) != null
  const effects = rules.cost.applyOverload(student.Id, ref, ex.Effects)
  const policy = rules.targeting.policy(effects)
  const includeEnemy = policy === 'select-any' || policy === 'mixed'
  return {
    name: ex.Name,
    icon: ex.Icon,
    cost: ex.Cost[exLevel - 1] ?? ex.Cost[0] ?? 0,
    duration: ex.Duration,
    targeting: targetingSpec(policy, overload),
    availableTargets: squadTargetOptions(squad, { mainOnly: overload, includeEnemy }, enemyLabel),
    isManualTarget: rules.targeting.requiresManualTarget(effects),
  }
}
