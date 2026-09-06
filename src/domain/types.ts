/**
 * 领域定义层（Definition）。
 *
 * 这里的类型描述“技能/学生是什么”，与运行时状态（StudentState / CardState 等）区分。
 * 数据层（SchaleDB 形状的 Student / SkillEffect）经由适配函数转换为本层定义。
 */

/** 学生技能的稳定引用；不依赖展示名称，支持变身后的 EX。 */
export type SkillRef =
  | { kind: 'ex' }
  | { kind: 'public' }
  | { kind: 'gear_public' }
  | { kind: 'passive' }
  | { kind: 'weapon_passive' }
  | { kind: 'extra_passive' }
  | { kind: 'extra_ex'; extraSkillId?: string; extraSkillIndex?: number }

/** 学生技能产生的召唤物类别。 */
export type SummonKind = 'vehicle' | 'cover' | 'summoned'

/** 效果实例在其生命周期内可记录的动作类型（供规则与引擎审计共用）。 */
export type EffectAuditAction =
  | 'scheduled'
  | 'applied'
  | 'expired'
  | 'used'
  | 'consumed'
  | 'rejected'
  | 'replaced'
  | 'dispelled'
  | 'ticked'

/** 不确定条件的结论必须由用户显式录入，保证推演可复现。 */
export type TriggerSource = 'automatic' | 'manual'

/** 用户对无法从学生数据确定的战况所作出的可审计确认。 */
export type ManualTriggerReason =
  | 'chance'
  | 'random_target'
  | 'hp_threshold'
  | 'external_state'
  | 'action_event'
  | 'interval'

export interface TriggerEvidence {
  source: TriggerSource
  /** manual 时至少记录一个用户确认的事实；automatic 不需要。 */
  reasons?: ManualTriggerReason[]
  /** 条件型或 Duration=-1 效果由用户确认的失效帧。 */
  conditionEndFrame?: number
}

export type TargetPolicyName =
  | 'self'
  | 'boss'
  | 'formation'
  | 'mixed'
  | 'select-ally'
  | 'select-any'

/** 技能的“需要什么目标”的领域描述。 */
export interface TargetSpec {
  policy: TargetPolicyName
  /** 手动选择时的最少目标数（select-ally / select-any）。 */
  min?: number
  /** 手动选择时的最多目标数。 */
  max?: number
  /** 目标限定的编队类型。 */
  squadType?: 'Main' | 'Support'
  /** 是否允许指向 Boss（敌方占位 -1）。 */
  canTargetEnemy?: boolean
}

/** 领域技能定义：技能是什么。 */
export interface SkillDefinition {
  ref: SkillRef
  name: string
  desc: string
  cost: number[]
  duration: number
  effects: import('../types/student').SkillEffect[]
  targeting?: TargetSpec
}

/** 领域学生定义：学生是什么。 */
export interface StudentDefinition {
  id: number
  name: string
  skills: SkillDefinition[]
}
