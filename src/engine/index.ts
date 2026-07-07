/**
 * Engine 层 — 统一导出
 *
 * 遵循 SDD v4.0 规范：纯 TS 沙盒，零 React 依赖。
 */

// Model
export { StudentState } from './model/types'
export type {
  Intent,
  BattleEnv,
  Formation,
  ActionRecord,
  ActionType,
  SimulationError,
  SimulationResult,
  StudentRuntimeState,
  CalibrationEntry,
  TimelineBlock,
  ShareCodePayload,
} from './model/types'

// FSM
export {
  canTransition,
  isInterruptible,
  buildTransition,
  applyTransition,
  VALID_TRANSITIONS,
  PRIORITY,
} from './model/fsm'

// Trigger Scheduler
export {
  TriggerScheduler,
  getNsSkill,
  getNsDuration,
} from './system/triggerScheduler'
export type { NsTriggerContext, NsTriggerResult } from './system/triggerScheduler'

// Cost System
export { computeCostTimeline, costAtFrame } from './system/costSystem'
export type { CostFrame } from './system/costSystem'

// Simulation Engine
export { SimulationEngine } from './core/simulationEngine'

// Bridge (Engine ↔ Store)
export {
  lanesToIntents,
  buildFormation,
  buildBattleEnv,
  runSimulation,
  mapToUiBlocks,
} from './bridge'
export type { UiTimelineBlock } from './bridge'
