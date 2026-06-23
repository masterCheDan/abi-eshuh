import type { Student, SquadType } from './student'

/** 队伍模式 */
export type SquadMode = 'normal' | 'total_assault'

/** 单个编队位置 */
export interface SquadSlot {
  /** 位置索引 */
  index: number
  /** 位置类型 */
  slotType: SquadType
  /** 位置标签（如 Main-1, Support-1） */
  label: string
  /** 已分配的学生 */
  student: Student | null
  /** 是否已锁定 */
  locked: boolean
}

/** 队伍配置 */
export interface SquadConfig {
  mode: SquadMode
  slots: SquadSlot[]
}
