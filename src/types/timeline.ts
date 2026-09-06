import type { Student } from './student'
import type { SkillRef, TriggerSource, TriggerEvidence } from '../domain/types'

/** 时间轴上的一个技能块（仅记录事实，不包含推导数据） */
export interface SkillBlock {
  /** 技能类型 */
  type: 'ex' | 'ns' | 'ss'
  /** 技能名称 */
  name: string
  /** 在时间轴上的施放时间点（帧） */
  startFrame: number
  /** 释放学生 ID */
  studentId: number
  /** 目标学生 ID（默认等于 studentId，表示自身） */
  targetId?: number
  /** 多目标事实来源。targetId 保留用于旧存档兼容。 */
  targetIds?: number[]
  /** 稳定事件 ID，用于分享码与召唤物目标跨导入复现。 */
  eventId?: string
  /** 可复现的召唤物目标引用（分享码导入时使用）。 */
  targetSummonRefs?: Array<{ summonId: number; sourceEventId: string; spawnIndex: number }>
  /** 已在场召唤物的稳定实例 ID；不占用学生 ID / Boss 占位。 */
  targetSummonIds?: string[]
  /** 稳定技能引用；缺失时由 type 按旧行为推导。 */
  skillRef?: SkillRef
  /** 手动触发代表用户已确认概率/阈值等外部条件成立。 */
  triggerSource?: TriggerSource
  /** v3 手动事实；未填写时按 triggerSource 兼容迁移。 */
  trigger?: TriggerEvidence
  /**
   * 实际 COST 消耗（可选）。
   * ExtraSkills（形态切换后的后续技能）Cost 为 0。
   * 未指定时退回 student.Skills.E.Cost[0]。
   */
  skillCost?: number
  /**
   * 动画时长（帧），可选。
   * ExtraSkills 使用自身 Duration 而非基础 EX 技能时长。
   */
  skillDuration?: number
  /**
   * 人工校准偏移（帧）。只对 NS/SS 生效。
   * 正值 = 延迟 N 帧触发，负值 = 提前 N 帧触发。
   * 设置后，块上显示锁/齿轮图标。
   */
  overrideOffset?: number
}

/** 时间轴上的一个学生轨道 */
export interface StudentLane {
  /** 轨道的固定序号（对应 squad slot index） */
  slotIndex: number
  /** 显示标签（如 "前排 1"、"后排 2"） */
  label: string
  /** 所属学生（null 表示空位） */
  student: Student | null
  /** 学生 ID（快捷字段） */
  studentId: number | null
  /** 该轨道上的技能块列表 */
  skills: SkillBlock[]
}

/** A preview, not an event fact. Never passed to the simulation engine. */
export interface NsSuggestion { id: string; slotIndex: number; block: SkillBlock }

/** 完整的时间轴状态 */
export interface TimelineState {
  /** 所有学生轨道 */
  lanes: StudentLane[]
  /** 总时长（帧） */
  totalFrames: number
  /** 当前播放头位置（帧） */
  currentFrame: number
}

