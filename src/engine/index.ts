/**
 * Engine 层 — 统一导出
 *
 * 遵循 SDD v4.0 规范：纯 TS 沙盒，零 React 依赖。
 */

// Model
export { StudentState } from './model/types'
export type {
  Intent,
  SkillRef,
  TriggerSource,
  BattleEnv,
  Formation,
  ActionRecord,
  ActionType,
  SimulationError,
  SimulationResult,
  EffectAuditRecord,
  CardStateSnapshot,
  CardOrderSnapshot,
  StudentRuntimeState,
  CalibrationEntry,
  TimelineBlock,
  ShareCodePayload,
  ShareCodePayloadV2,
  ShareCodeEventV2,
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
export {
  computeCostTimeline,
  costAtFrame,
  COST_SCALE,
  baseMaxCost,
  formationMaxCost,
  UNIQUE_WEAPON_4_SUPPORT_MAX_COST_BONUS,
} from './system/costSystem'
export type { CostFrame } from './system/costSystem'
export { applyCostModifier, costModifierAtFrame, effectiveCostAtFrame } from './system/costModifier'
export type { CostModifier, CostChangeValueType } from './system/costModifier'

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
