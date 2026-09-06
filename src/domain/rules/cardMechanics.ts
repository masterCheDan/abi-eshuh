/**
 * 卡机制注册表：把“学生卡牌行为”从 CardOrderSystem 的 per-student switch
 * 迁出为可注册的机制定义。
 *
 * 当前实现声明式 transform（自抓 + 卡面变换 + 可选超时），后续特殊机制
 * （复制/固定序列/连射/充能/水位等）逐步迁移为 SpecialMechanic。
 */
import type { SkillRef, EffectAuditAction } from '../types'

export interface TransformCardMechanic {
  kind: 'transform'
  studentId: number
  /** 首放后的卡面。 */
  transformSkillRef: SkillRef
  /** 首放后是否自抓（保持手牌）。 */
  selfRedraw: boolean
  /** 变换持续帧数；缺省 = 本局永久。 */
  expiresAfter?: number
  /** 超时后是否移回牌序末尾。 */
  moveToTailOnExpiry?: boolean
  /** 莉音复制该学生 EX 后，复制路径使用的行为 id（引擎侧 copiedBehaviorHandlers）。 */
  copiedBehaviorId?: string
}

export interface FriendMarkerCardMechanic {
  kind: 'friend-marker'
  studentId: number
  /** 首放后的卡面。 */
  transformSkillRef: SkillRef
  /** 首放需要选定的目标数量范围。 */
  minTargets: number
  maxTargets: number
  targetSquadType: 'Main' | 'Support'
  /** 被标记目标施放 EX 时的计数机制（如贝壳）。 */
  counter?: {
    gainPerEx: number
    threshold: number
    /** 未激活（普通）与激活（开花）时使用的 Buff Value 行下标。 */
    baseValueRowIndex: number
    activeValueRowIndex: number
  }
  /** 变形技能需要重定向到标记目标并选行的 Buff Stat（效果数据取自基础 EX Effects）。 */
  buffStat?: string
  /** 莉音复制该学生 EX 后，复制路径使用的行为 id（引擎侧 copiedBehaviorHandlers）。 */
  copiedBehaviorId?: string
}

/** 特殊卡机制可读写的槽位状态（由 CardOrderSystem 提供实现）。 */
export interface CardMechanicState {
  overrideRef?: SkillRef
  copiedFromSlot?: number
  copyUses: number
  hinaStage?: number
  hinaExpiresAt?: number
  mechanicExpiresAt?: number
  mechanicTailOnExpiry?: boolean
  markerTargets: number[]
  markerCount: number
  markerActive: boolean
  mikaRapidExpiresAt?: number
  mikaAttackUses: number
  aliceEnergy: number
  pinned: boolean
}

/** 特殊卡机制（behavior）执行时的上下文。 */
export interface CardPlayContext {
  slot: number
  studentId: number
  skillId: string | undefined
  skillRef: SkillRef
  targetIds: number[]
  frame: number
  state: CardMechanicState
  keepInHand(): void
  consumeNormally(preferredDrawSlot?: number): void
  moveToTail(): void
  record(skillRef: SkillRef, action: EffectAuditAction, detail: string): void
  resolveSlot(studentId: number): number
  pushPendingCopy(sourceSlot: number, atFrame: number): void
  waterCounts(slot: number): number | undefined
  spendWaterCount(slot: number): boolean
}

export interface BehaviorCardMechanic {
  kind: 'behavior'
  studentId: number
  /** 行为实现注册在 CardOrderSystem.behaviorHandlers（引擎侧，单一位置）。 */
  behaviorId: string
  /** 莉音复制该学生 EX 后，复制路径使用的行为 id（引擎侧 copiedBehaviorHandlers）。 */
  copiedBehaviorId?: string
  /** 额外 EX 放行：直接允许 EX_CARD_RULES[studentId].extraSkillIds 中的技能。 */
  allowExtraExFromRule?: boolean
  /** 仅当手动触发且带 external_state 原因时才允许施放的额外 EX skill id。 */
  externalTriggerSkillIds?: string[]
  /** 被控（CC）期间提前终止当前卡形态（如固定序列）。 */
  ccInterruptsSequence?: boolean
  /** 技能成本随使用次数递增（如连射攻击 EX）。 */
  costEscalation?: {
    skillId: string
    /** 按使用次数升序的档位；uses >= minUses 时生效，取最后一档。 */
    tiers: Array<{ minUses: number; cost: number }>
  }
  /** 队友施放 EX 时累计的水位（如花子泳装被动）。 */
  waterGauge?: {
    gainPerTeamEx: number
    maxCounts: number
  }
}

export type CardMechanic = TransformCardMechanic | FriendMarkerCardMechanic | BehaviorCardMechanic

export const CARD_MECHANICS: readonly CardMechanic[] = [
  // 妮露（制服）：1 Cost 重抓，70 秒内变换为攻击 EX。
  { kind: 'transform', studentId: 10111, transformSkillRef: { kind: 'extra_ex', extraSkillId: 'CH0280Ex02' }, selfRedraw: true, expiresAfter: 2100, copiedBehaviorId: 'transform-copied' },
  // 瞬（泳装）：重抓，9 秒内变换为攻击 EX，超时移回牌序末尾。
  { kind: 'transform', studentId: 10143, transformSkillRef: { kind: 'extra_ex', extraSkillId: 'CH0355_01Ex02' }, selfRedraw: true, expiresAfter: 270, moveToTailOnExpiry: true },
  // 伊吹（泳装）：选定 1-2 名前锋为「好朋友」，本局永久变换为「选哪个好呢？」，
  // 变形技能固定作用于好友；好友施放 EX 时 +3 贝壳，满 12 开「贝壳花」（Buff ×1.2 行）。
  {
    kind: 'friend-marker',
    studentId: 20060,
    transformSkillRef: { kind: 'extra_ex', extraSkillId: 'CH0347Ex02' },
    minTargets: 1,
    maxTargets: 2,
    targetSquadType: 'Main',
    counter: { gainPerEx: 3, threshold: 12, baseValueRowIndex: 0, activeValueRowIndex: 1 },
    buffStat: 'CriticalDamageRate_Coefficient',
  },
  // 花子（泳装）：水位计计数不低于 1 时重新抓取自身 EX；队友 EX 每次 +40，满 100 积 1 层（最多 2）。
  { kind: 'behavior', studentId: 10074, behaviorId: 'water-gauge', copiedBehaviorId: 'water-gauge-copied', waterGauge: { gainPerTeamEx: 40, maxCounts: 2 } },
  // 日奈（礼服）：固定三段 0 Cost EX，形态持续 10 秒且每段刷新持续时间；被控时提前终止。
  { kind: 'behavior', studentId: 10086, behaviorId: 'fixed-sequence', copiedBehaviorId: 'fixed-sequence-copied', ccInterruptsSequence: true },
  // 未花（泳装）：连射期间固定自身卡，结束或超时后移至牌序末尾；攻击 EX 按次数升 Cost（2 次后 6、4 次后 10）。
  { kind: 'behavior', studentId: 10122, behaviorId: 'rapid-fire', copiedBehaviorId: 'rapid-fire-copied', allowExtraExFromRule: true, costEscalation: { skillId: 'CH0294Ex02', tiers: [{ minUses: 2, cost: 6 }, { minUses: 4, cost: 10 }] } },
  // 爱丽丝（临战）：充能技能重新抓取自身卡，攻击技能消费该卡。
  { kind: 'behavior', studentId: 10134, behaviorId: 'charge-attack', copiedBehaviorId: 'charge-attack-copied', allowExtraExFromRule: true },
  // 伊吹：卡牌属于伊吹、执行主体为虎丸；骑乘 EX 需手动触发且带 external_state 事实。
  { kind: 'behavior', studentId: 16014, behaviorId: 'riding-executor', externalTriggerSkillIds: ['CH0077RidingEx01'] },
  // 莉音：重新抓取自身卡并复制所选 STRIKER 的当前 EX 状态，一次后还原。
  { kind: 'behavior', studentId: 20041, behaviorId: 'copy-target' },
]

export function cardMechanic(studentId: number): CardMechanic | undefined {
  return CARD_MECHANICS.find(mechanic => mechanic.studentId === studentId)
}
