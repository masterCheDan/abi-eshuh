import type { Student, SquadType } from './student'

/** 队伍模式 */
export type SquadMode = 'normal' | 'total_assault'

/** 引擎侧所需的每槽位技能等级 / 养成配置（由 store 或调用方从 SquadSlot 提供）。 */
export interface SlotLevels {
  /** EX 技能等级 (1-5) */
  exLevel: number
  /** NS 技能等级 (1-10) */
  nsLevel: number
  /** SS 技能等级 (1-10) */
  ssLevel: number
  /** 当前养成星级（不得低于学生初始星级） */
  starLevel: number
  /** 专武等级；0=未解锁，1-4=专武星级 */
  uniqueWeaponLevel: number
  /** 爱用品状态；0=未装备，1=已装备 T1，2=已升级 T2 */
  gearLevel: 0 | 1 | 2
}

/** 单个编队位置 */
export interface SquadSlot extends SlotLevels {
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
