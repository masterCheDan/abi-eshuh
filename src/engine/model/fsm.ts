/** 战斗实体有限状态机 (FSM) 的优先级与可打断性定义。 */

import { StudentState } from './types'

// ── 优先级常量 ──
/** 意图优先级: CC = 0 (最高), USER_EX = 1, SYSTEM_NS = 2 (最低) */
export const PRIORITY = {
  CC_APPLY: 0,
  EX_CAST: 1,
  SS_TRIGGER: 1, // SS 与用户 EX 同优先级
  NS_TRIGGER: 2,
} as const

/** 打断优先级：哪些状态可以被 EX / CC 强制打断 */
export const INTERRUPTIBLE: Set<StudentState> = new Set([
  StudentState.AA,
  StudentState.NS,
  StudentState.SS_CAST,
  StudentState.RELOAD,
  StudentState.IDLE,
])

/** 检查某个状态是否可被 EX/CC 打断 */
export function isInterruptible(state: StudentState): boolean {
  return INTERRUPTIBLE.has(state)
}
