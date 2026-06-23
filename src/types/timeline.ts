import type { Student } from './student'

/** 时间轴上的一个技能块 */
export interface SkillBlock {
  /** 技能类型 */
  type: 'ex' | 'ns' | 'ss'
  /** 技能名称 */
  name: string
  /** 在时间轴上的起始位置（帧） */
  startFrame: number
  /** 生效延迟（帧），startFrame + applyFrame = 技能实际生效点 */
  applyFrame: number
  /** 动画总持续时间（帧） */
  duration: number
  /** 所属学生 ID（用于拖拽时传递） */
  studentId?: number
}

/** 时间轴上的一个学生轨道 */
export interface StudentLane {
  /** 学生 ID */
  studentId: number
  /** 学生引用 */
  student: Student
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

