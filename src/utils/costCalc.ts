/**
 * 兼容层：UI 不再维护第二套 Cost 规则。
 * 所有调用都委托给 SimulationEngine，保留旧接口仅为减少组件迁移成本。
 */
import type { StudentLane } from '../types/timeline'
import type { SquadMode } from '../types/squad'
import { SimulationEngine } from '../engine/core/simulationEngine'
import { lanesToIntents } from '../engine/bridge'
import { COST_SCALE } from '../engine/system/costSystem'

export { COST_SCALE }

export interface CostFrame { frame: number; cost: number }

export function computeCostTimeline(lanes: StudentLane[], mode: SquadMode): CostFrame[] {
  const students = new Map(lanes.flatMap(lane => lane.student ? [[lane.student.Id, lane.student] as const] : []))
  const engine = new SimulationEngine()
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 5400 },
    { mode, slots: [...lanes].sort((a, b) => a.slotIndex - b.slotIndex).map(lane => lane.student?.Id ?? null) },
    students,
  )
  return engine.simulate(lanesToIntents(lanes)).costHistory.map((cost, frame) => ({ frame, cost }))
}

export function costAtFrame(timeline: CostFrame[], frame: number): number {
  if (timeline.length === 0) return 0
  return timeline[Math.max(0, Math.min(frame, timeline.length - 1))]?.cost ?? 0
}
