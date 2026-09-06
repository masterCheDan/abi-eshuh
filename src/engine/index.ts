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
  ManualTriggerReason,
  TriggerEvidence,
  BattleEnv,
  Formation,
  ActionRecord,
  ActionEvent,
  SchedulingDiagnostic,
  NsSchedulingConfig,
  NsSchedulingResult,
  NsScheduleRecord,
  ActionType,
  SimulationError,
  SimulationResult,
  EffectAuditRecord,
  SummonInstance,
  CardStateSnapshot,
  CardOrderSnapshot,
  StudentRuntimeState,
  CalibrationEntry,
  TimelineBlock,
  ShareCodePayload,
  ShareCodePayloadV2,
  ShareCodeEventV2,
  ShareCodePayloadV3,
  ShareCodeEventV3,
} from './model/types'

// Summon target helpers (UI 辅助)
export { activeSummonsAtFrame, summonTargetLabel } from './system/summonTargets'

// FSM
export {
  isInterruptible,
  PRIORITY,
} from './model/fsm'

// Cost System
export {
  COST_SCALE,
  baseMaxCost,
  formationMaxCost,
  UNIQUE_WEAPON_4_SUPPORT_MAX_COST_BONUS,
} from './system/costSystem'
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
export type { UiTimelineBlock, RunSimulationInput } from './bridge'
