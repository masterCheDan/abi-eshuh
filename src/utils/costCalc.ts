/**
 * 兼容层：UI 不再维护第二套 Cost 规则。
 * 所有调用都委托给 SimulationEngine，保留旧接口仅为减少组件迁移成本。
 */
import type { StudentLane } from '../types/timeline'
import type { SquadMode } from '../types/squad'
import type { SimulationResult } from '../engine/model/types'
import { SimulationEngine } from '../engine/core/simulationEngine'
import { buildFormation, lanesToIntents } from '../engine/bridge'
import { COST_SCALE } from '../engine/system/costSystem'
import { effectiveCostAtFrame } from '../engine/system/costModifier'
import { useSquadStore } from '../stores/useSquadStore'

export { COST_SCALE }

export interface CostFrame { frame: number; cost: number }

export function computeCostSimulation(lanes: StudentLane[], mode: SquadMode): SimulationResult {
  const students = new Map(lanes.flatMap(lane => lane.student ? [[lane.student.Id, lane.student] as const] : []))
  const engine = new SimulationEngine()
  const formation = buildFormation(lanes, useSquadStore.getState().deckOrder)
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 5400 },
    { ...formation, mode },
    students,
  )
  return engine.simulate(lanesToIntents(lanes))
}

export function costFramesFromResult(result: SimulationResult | null): CostFrame[] {
  return (result?.costHistory ?? []).map((cost, frame) => ({ frame, cost }))
}

export function computeCostTimeline(lanes: StudentLane[], mode: SquadMode): CostFrame[] {
  return costFramesFromResult(computeCostSimulation(lanes, mode))
}

export function costAtFrame(timeline: CostFrame[], frame: number): number {
  if (timeline.length === 0) return 0
  return timeline[Math.max(0, Math.min(frame, timeline.length - 1))]?.cost ?? 0
}

export function effectiveSkillCostAtFrame(
  result: SimulationResult | null,
  studentId: number,
  frame: number,
  baseCost: number,
): number {
  return result
    ? effectiveCostAtFrame(result.effectAudit, studentId, frame, baseCost)
    : Math.max(0, baseCost)
}

export function costBorrowLimitAtFrame(
  result: SimulationResult | null,
  studentId: number,
  frame: number,
): number {
  if (!result) return 0
  const removedActions = new Set(['expired', 'consumed', 'replaced', 'dispelled'])
  return result.effectAudit.reduce((limit, record) => {
    if (
      record.effectType !== 'Special'
      || record.action !== 'applied'
      || !record.targetIds.includes(studentId)
      || !record.detail?.startsWith('CostOverload=')
      || record.frame > frame
      || (record.expiresAt != null && record.expiresAt <= frame)
    ) return limit
    if (record.effectId != null && result.effectAudit.some(candidate =>
      candidate.effectId === record.effectId
      && candidate.frame <= frame
      && removedActions.has(candidate.action))) return limit
    return Math.max(limit, record.value ?? 0)
  }, 0)
}

export function canAffordSkillAtFrame(
  result: SimulationResult | null,
  studentId: number,
  frame: number,
  requiredCost: number,
): boolean {
  if (requiredCost <= 0) return true
  const available = result?.costHistory[Math.max(0, Math.min(frame, result.maxFrame))] ?? 0
  const borrowLimit = costBorrowLimitAtFrame(result, studentId, frame) * COST_SCALE
  return available >= requiredCost || available - requiredCost >= -borrowLimit
}
