import type { Student } from './student'

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

/** 完整的时间轴状态 */
export interface TimelineState {
  /** 所有学生轨道 */
  lanes: StudentLane[]
  /** 总时长（帧） */
  totalFrames: number
  /** 当前播放头位置（帧） */
  currentFrame: number
}

