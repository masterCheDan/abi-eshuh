/**
 * Engine 层核心类型定义
 *
 * 遵循 SDD v4.0 契约，所有类型不含 UI 属性。
 * 引擎是纯 TS 沙盒，零 React / Zustand 依赖。
 */

// ═══════════════════════════════════════════════════
// 1. 意图 (Intent) — 唯一事实来源
// ═══════════════════════════════════════════════════

/** 学生技能的稳定引用；不依赖展示名称，支持变身后的 EX。 */
export type SkillRef =
  | { kind: 'ex' }
  | { kind: 'public' }
  | { kind: 'gear_public' }
  | { kind: 'passive' }
  | { kind: 'weapon_passive' }
  | { kind: 'extra_passive' }
  | { kind: 'extra_ex'; extraSkillId?: string; extraSkillIndex?: number }

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

export interface Intent {
  /** 唯一标识，支持增删改查 */
  id: string
  /** 触发帧 */
  frame: number
  /** 意图类型 */
  type: 'EX_CAST' | 'NS_TRIGGER' | 'SS_TRIGGER' | 'CC_APPLY'
  /** 释放学生 ID */
  issuerId: number
  /** 目标学生 ID 列表；-1 = Boss */
  targetIds: number[]
  /** 优先级 (CC > User_EX > System_NS) */
  priority: number
  /** 具体技能；旧轴码省略时按 type 推导。 */
  skillRef?: SkillRef
  /** automatic 仅用于具有结构化 TriggerSpec 的确定性技能。 */
  triggerSource?: TriggerSource
  /** v3+ 的完整触发事实；缺失时由 triggerSource 迁移。 */
  trigger?: TriggerEvidence
}

// ═══════════════════════════════════════════════════
// 2. 战斗环境
// ═══════════════════════════════════════════════════

export interface BattleEnv {
  /** Boss ID (0=无Boss, 仅模拟我方) */
  bossId: number
  /** 难度等级 (1-5 对应 Normal→Torment) */
  difficulty: number
  /** Boss 护甲类型 */
  armorType: string
  /** 地形 (0=Street, 1=Outdoor, 2=Indoor) */
  terrain: number
  /** 最大帧数 (默认 5400 = 3分钟) */
  maxFrame: number
}

export interface Formation {
  /** 模式：normal(4+2) / total_assault(6+4) */
  mode: 'normal' | 'total_assault'
  /** 学生 ID 数组（null = 空位），按 slotIndex 排列 */
  slots: (number | null)[]
  /** 全队列发牌顺序 (学生 slotIndex 数组) */
  deckOrder?: number[]
  /** 各槽位 EX 技能等级 (1-5)，按 slotIndex 排列 */
  skillLevels?: number[]
  /** 公共技能等级 (1-10)，按 slotIndex 排列。 */
  publicSkillLevels?: number[]
  /** 被动/额外被动等级 (1-10)，按 slotIndex 排列。 */
  passiveSkillLevels?: number[]
  /** 学生当前星级，按 slotIndex 排列。 */
  starLevels?: number[]
  /** 专武等级；0=未解锁，1-4=专武星级，按 slotIndex 排列。 */
  uniqueWeaponLevels?: number[]
}

// ═══════════════════════════════════════════════════
// 3. 动作记录 (纯逻辑，无 UI 属性)
// ═══════════════════════════════════════════════════

export type ActionType = 'AA' | 'NS' | 'SS' | 'EX' | 'RELOAD' | 'MOVE' | 'CC' | 'PHASE'

export interface ActionRecord {
  recordId: string
  studentId: number
  slotIndex: number
  actionType: ActionType
  startFrame: number
  /** 首个效果生效帧 */
  effectFrame: number
  endFrame: number
  /** 是否被 EX/CC 中途打断 */
  wasInterrupted: boolean
  /** 是否来自人工校准 */
  isManualOverride: boolean
  /** 打断该动作的帧（被中断时填写） */
  interruptedAt?: number
}

// ═══════════════════════════════════════════════════
// 4. 引擎推演结果
// ═══════════════════════════════════════════════════

export interface SimulationError {
  frame: number
  issuerId: number
  message: string
  type: 'COST_EXCEEDED' | 'OUT_OF_WINDOW' | 'COOLDOWN' | 'INVALID_TARGET' | 'INVALID_CONDITION'
}

export interface EffectAuditRecord {
  frame: number
  issuerId: number
  targetIds: number[]
  skillRef: SkillRef
  effectIndex: number
  effectType: string
  action: 'scheduled' | 'applied' | 'expired' | 'used' | 'consumed' | 'rejected' | 'replaced' | 'dispelled' | 'ticked'
  detail?: string
  /** Stable runtime effect instance, used to reconstruct its visible lifetime. */
  effectId?: number
  stat?: string
  value?: number
  /** CostChange interpretation. BaseAmount is additive; Coefficient uses 1/10000 units. */
  valueType?: 'BaseAmount' | 'Coefficient'
  /** Remaining/initial uses for an auditable CostChange instance. */
  uses?: number
  /** Natural end frame; omitted means active until removed or battle end. */
  expiresAt?: number
}

export interface EffectLedgerEntry {
  frame: number
  issuerId: number
  targetId: number
  skillRef: SkillRef
  effectType: 'Damage' | 'Heal' | 'Regen' | 'DamageDebuff'
  /** 原始倍率/数值；不会在没有敌方数值模型时伪造最终 HP。 */
  value: number
  hits: number
  detail?: string
}

export interface CardStateSnapshot {
  /** Card owner in formation slot space; copied cards keep their owner. */
  slotIndex: number
  studentId: number
  /** Current card face (base, transformed, fixed sequence, or copied source state). */
  skillRef: SkillRef
  copiedFromSlot?: number
  pinned: boolean
  /** Auditable compact state labels such as water/energy/rapid-fire count. */
  labels: string[]
}

export interface CardOrderSnapshot {
  /** Successful EX cards consumed; retained for v1 UI compatibility. */
  left: number
  size: number
  /** Normalized complete initial deck (slotIndex[]). */
  deck: number[]
  /** Actual cards currently available. */
  hand: CardStateSnapshot[]
  /** Top-to-bottom draw queue. */
  drawPile: CardStateSnapshot[]
}

export interface SimulationResult {
  /** 最大帧数 */
  maxFrame: number
  /** 当前编队的 Cost 上限（已乘 COST_SCALE）。 */
  maxCost: number
  /** 每帧 Cost 快照 (index = frame) */
  costHistory: number[]
  /** 纯逻辑动作记录 */
  actionLogs: ActionRecord[]
  /** 错误/警告列表 */
  errors: SimulationError[]
  /** 学生技能效果的可审计执行记录。 */
  effectAudit: EffectAuditRecord[]
  /** 伤害、治疗、持续效果的逐次账本。 */
  effectLedger: EffectLedgerEntry[]
  /** Deterministic hand and draw-pile state. */
  window?: CardOrderSnapshot
  /** slotIndex → 可恢复的运行时状态 (用于增量推演) */
  finalRuntimes: Map<number, StudentRuntimeState>
}

// ═══════════════════════════════════════════════════
// 5. 运行时状态 (Engine 内部)
// ═══════════════════════════════════════════════════

export const StudentState = {
  IDLE: 'IDLE',
  AA: 'AA',
  NS: 'NS',
  SS_CAST: 'SS_CAST',
  EX: 'EX',
  RELOAD: 'RELOAD',
  CC: 'CC',
  PHASE_TRANSITION: 'PHASE_TRANSITION',
} as const
export type StudentState = (typeof StudentState)[keyof typeof StudentState]

export interface StudentRuntimeState {
  slotIndex: number
  studentId: number
  currentState: StudentState
  previousState: StudentState
  attackCount: number
  ammoRemaining: number
  currentActionStartFrame: number
  currentActionEndFrame: number
  currentShotIndex: number
  queuedEx: { startFrame: number; duration: number }[]
  controlledUntil: number
  phaseTransitionUntil: number
  nsTriggered: boolean
  /** Special / Accumulation 等状态标签 → 层数。 */
  specialStacks: Record<string, number>
  /** 当前护盾值（仅学生技能层面，不引入 Boss 数值）。 */
  shield: number
  /** 当前召唤物数量（按 SummonId 计数）。 */
  summons: Record<string, number>
}

// ═══════════════════════════════════════════════════
// 6. 人工校准表
// ═══════════════════════════════════════════════════

export interface CalibrationEntry {
  /** 学生 slotIndex */
  charIdx: number
  /** 技能类型 */
  skill: 'NS' | 'SS'
  /** 第几次触发 (1-based) */
  occurrence: number
  /** 偏移帧数 (+N=延迟N帧, -N=提前N帧) */
  offset: number
}

// ═══════════════════════════════════════════════════
// 7. UI ViewModel (Store 衍生数据)
// ═══════════════════════════════════════════════════

export interface TimelineBlock extends ActionRecord {
  /** 映射为 UI 渲染颜色 */
  uiColor: string
  /** 轨道序号 */
  uiTrackIndex: number
  /** 视觉打断截断效果 */
  isVisuallyCut: boolean
}

// ═══════════════════════════════════════════════════
// 8. 分享码结构
// ═══════════════════════════════════════════════════

export interface ShareCodePayload {
  ver: string
  env: [number, number, number, number]     // [bossId, difficulty, armorIdx, terrain]
  form: (number | null)[]                    // slot → studentId
  init?: number[]                            // 全队列发牌顺序 (slotIndex[])
  tl: string[]                               // 轴本体: "900 0 [0]" = "帧 casterIdx [targetIds]"
  cfg?: {
    override: CalibrationEntry[]
  }
}

/** v2 轴码事件，所有字段均为用户录入的事实。 */
export interface ShareCodeEventV2 {
  frame: number
  casterSlot: number
  targetSlots: number[]
  skillRef: SkillRef
  triggerSource: TriggerSource
}

export interface ShareCodePayloadV2 {
  ver: '2.0.0'
  env: [number, number, number, number]
  form: (number | null)[]
  init?: number[]
  events: ShareCodeEventV2[]
  cfg?: { override: CalibrationEntry[] }
}

export interface ShareCodeEventV3 extends ShareCodeEventV2 {
  trigger: TriggerEvidence
}

export interface ShareCodePayloadV3 {
  ver: '3.0.0'
  env: [number, number, number, number]
  form: (number | null)[]
  init?: number[]
  events: ShareCodeEventV3[]
  /** [星级, 专武等级]，按 slotIndex 对齐；旧 v3 分享码可省略。 */
  ranks?: Array<[number, number] | null>
  cfg?: { override: CalibrationEntry[] }
}
