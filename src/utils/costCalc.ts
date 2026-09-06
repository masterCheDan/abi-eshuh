/**
 * 兼容层：UI 不再维护第二套 Cost 规则。
 * 所有调用都委托给 SimulationEngine，保留旧接口仅为减少组件迁移成本。
 *
 * Cost 预演边界：Cost 受 Buff（RegenCost/CostChange/CostOverload）影响，预演必须
 * 携带效果审计；因此这里仍运行完整引擎（引擎内部已抽取独立 CostSystem），
 * UI 只消费只读结果，不直接触碰 Cost 实现。
 */
import type { StudentLane } from '../types/timeline'
import type { Student } from '../types/student'
import type { SquadMode, SlotLevels } from '../types/squad'
import type { SimulationResult, SkillRef } from '../engine'
import { SimulationEngine, buildFormation, lanesToIntents, COST_SCALE, effectiveCostAtFrame } from '../engine'

export { COST_SCALE }

export interface CostFrame { frame: number; cost: number }

export function computeCostSimulation(
  lanes: StudentLane[],
  mode: SquadMode,
  slotLevels: ReadonlyArray<SlotLevels>,
  deckOrder: number[] | null = null,
): SimulationResult {
  const students = new Map(lanes.flatMap(lane => lane.student ? [[lane.student.Id, lane.student] as const] : []))
  const engine = new SimulationEngine()
  const formation = buildFormation(lanes, deckOrder, slotLevels)
  engine.loadBattle(
    { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 5400 },
    { ...formation, mode },
    students,
  )
  return engine.simulate(lanesToIntents(lanes, slotLevels))
}

export function costFramesFromResult(result: SimulationResult | null): CostFrame[] {
  return (result?.costHistory ?? []).map((cost, frame) => ({ frame, cost }))
}

export function computeCostTimeline(
  lanes: StudentLane[],
  mode: SquadMode,
  slotLevels: ReadonlyArray<SlotLevels>,
  deckOrder: number[] | null = null,
): CostFrame[] {
  return costFramesFromResult(computeCostSimulation(lanes, mode, slotLevels, deckOrder))
}

export function costAtFrame(timeline: CostFrame[], frame: number): number {
  if (timeline.length === 0) return 0
  return timeline[Math.max(0, Math.min(frame, timeline.length - 1))]?.cost ?? 0
}

/**
 * 按槽位 EX 等级解析技能基础 Cost。块上已携带 skillCost 时优先使用（由调用方决定）。
 * 普通 EX 取 Skills.E.Cost[exLevel-1]；extra_ex 解析对应 ExtraSkill 的等级 Cost，
 * 找不到匹配 ExtraSkill 时回退基础 EX 的 Cost[0]。
 */
export function skillBaseCost(student: Student, ref: SkillRef, exLevel: number): number {
  if (ref.kind === 'extra_ex') {
    const extra = (student.Skills.E.ExtraSkills ?? []).find(skill =>
      ref.extraSkillId ? skill.Id === ref.extraSkillId : skill === student.Skills.E.ExtraSkills?.[ref.extraSkillIndex ?? 0])
    if (extra) return extra.Cost?.[exLevel - 1] ?? extra.Cost?.[0] ?? 0
    return student.Skills.E.Cost[0] ?? 0
  }
  return student.Skills.E.Cost[exLevel - 1] ?? student.Skills.E.Cost[0] ?? 0
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
