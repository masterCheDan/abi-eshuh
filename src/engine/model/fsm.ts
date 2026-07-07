/**
 * 战斗实体有限状态机 (FSM) 定义
 *
 * 严格遵循 SDD v4.0 的合法状态与转移规则：
 * - IDLE → AA, NS, RELOAD (自然跳转)
 * - CC / EX → 最高优先级, 强制打断任何动作
 * - 打断 RELOAD 底层判定弹匣满
 */

import { StudentState } from './types'
import type { StudentRuntimeState } from './types'

// ── 合法状态转移表 (当前状态 → 可跳转的目标状态集合) ──
export const VALID_TRANSITIONS: Record<StudentState, StudentState[]> = {
  [StudentState.IDLE]: [
    StudentState.AA,
    StudentState.NS,
    StudentState.RELOAD,
    StudentState.EX,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.AA]: [
    StudentState.IDLE,
    StudentState.RELOAD,
    StudentState.NS,
    StudentState.EX,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.NS]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.RELOAD,
    StudentState.EX,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.SS_CAST]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.EX,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.EX]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.RELOAD,
    StudentState.NS,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.RELOAD]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.NS,
    StudentState.EX,
    StudentState.CC,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.CC]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.RELOAD,
    StudentState.PHASE_TRANSITION,
  ],
  [StudentState.PHASE_TRANSITION]: [
    StudentState.IDLE,
    StudentState.AA,
    StudentState.RELOAD,
  ],
}

/** 判断从 from → to 是否是合法跳转 */
export function canTransition(from: StudentState, to: StudentState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

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

// ── FSM 动作 ──

export interface FsmTransition {
  /** 执行状态跳转 */
  from: StudentState
  to: StudentState
  /** 新动作的结束帧 */
  endFrame: number
  /** 弹匣更新（RELOAD → AA 时 ammoRemaining = maxAmmo） */
  reloadAmmo?: number
}

/**
 * 生成 FSM 跳转结果
 * 注意：此函数仅做合法性校验和参数组装，不修改 runtime
 */
export function buildTransition(
  runtime: StudentRuntimeState,
  targetState: StudentState,
  currentFrame: number,
  actionDuration: number,
  maxAmmo?: number,
): FsmTransition | null {
  if (!canTransition(runtime.currentState, targetState)) {
    return null
  }

  const result: FsmTransition = {
    from: runtime.currentState,
    to: targetState,
    endFrame: currentFrame + actionDuration,
  }

  // 进入 RELOAD → 弹匣补满（游戏机制：换弹动画第0帧弹匣已满）
  if (targetState === StudentState.RELOAD && maxAmmo != null) {
    result.reloadAmmo = maxAmmo
  }

  return result
}

/** 应用 FSM 跳转到运行时状态 */
export function applyTransition(
  runtime: StudentRuntimeState,
  trans: FsmTransition,
  currentFrame: number,
): void {
  runtime.previousState = runtime.currentState
  runtime.currentState = trans.to
  runtime.currentActionStartFrame = currentFrame
  runtime.currentActionEndFrame = trans.endFrame

  if (trans.reloadAmmo != null) {
    runtime.ammoRemaining = trans.reloadAmmo
  }
}
