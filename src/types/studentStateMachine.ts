// ==================================================
// 学生战斗状态机 — 类型定义
// ==================================================

export const StudentState = {
  PHASE_TRANSITION: 'PHASE_TRANSITION',
  CONTROLLED: 'CONTROLLED',
  CAST_EX: 'CAST_EX',
  CAST_NS_SS: 'CAST_NS_SS',
  NORMAL_ATTACK: 'NORMAL_ATTACK',
  MOVING: 'MOVING',
} as const
export type StudentState = (typeof StudentState)[keyof typeof StudentState]

export const SimEventType = {
  PHASE_TRANSITION_START: 'PHASE_TRANSITION_START',
  PHASE_TRANSITION_END: 'PHASE_TRANSITION_END',
  CONTROL_START: 'CONTROL_START',
  CONTROL_END: 'CONTROL_END',
  MOVE_START: 'MOVE_START',
  MOVE_END: 'MOVE_END',
  NORMAL_ATTACK_START: 'NORMAL_ATTACK_START',
  NORMAL_ATTACK_HIT: 'NORMAL_ATTACK_HIT',
  NORMAL_ATTACK_END: 'NORMAL_ATTACK_END',
  NS_TRIGGER: 'NS_TRIGGER',
  NS_START: 'NS_START',
  NS_END: 'NS_END',
  SS_TRIGGER: 'SS_TRIGGER',
  SS_START: 'SS_START',
  SS_END: 'SS_END',
  EX_START: 'EX_START',
  EX_HIT: 'EX_HIT',
  EX_END: 'EX_END',
  RELOAD_START: 'RELOAD_START',
  RELOAD_END: 'RELOAD_END',
} as const
export type SimEventType = (typeof SimEventType)[keyof typeof SimEventType]

export interface SimEvent {
  frame: number
  type: SimEventType
  slotIndex: number
  studentId: number
  data?: Record<string, unknown>
}

/** 学生运行时状态 */
export interface StudentRuntimeState {
  slotIndex: number
  studentId: number
  currentState: StudentState
  previousState: StudentState
  /** 普攻计数器（用于 NS/SS 触发判定） */
  attackCount: number
  /** 剩余弹药 */
  ammoRemaining: number
  /** 当前动作起始帧 */
  currentActionStartFrame: number
  /** 当前动作结束帧 */
  currentActionEndFrame: number
  /** 当前射击序号（本轮弹匣内） */
  currentShotIndex: number
  /** 排队的 EX 技能列表（按 startFrame 排序） */
  queuedEx: { startFrame: number; duration: number }[]
  /** 控制效果结束帧（0 = 未被控） */
  controlledUntil: number
  /** Boss 阶段转换结束帧（0 = 不在转换中） */
  phaseTransitionUntil: number
  /** NS 已触发，等待当前动作结束后施放 */
  nsTriggered: boolean
}

/** 战斗可视化片段 */
export interface BattleSegment {
  startFrame: number
  endFrame: number
  /** 片段类型 */
  type: 'prepare' | 'attack' | 'reload' | 'interrupted' | 'ex' | 'ns' | 'ss' | 'move' | 'controlled' | 'phase_transition'
  /** 射击序号 */
  index: number
}

/** SelectNextAction 决策上下文 */
export interface ActionContext {
  runtime: StudentRuntimeState
  frame: number
}
