/**
 * Cost 系统 (Engine 层)
 *
 * 迁移自 utils/costCalc.ts，抽离为纯 TS 无副作用模块。
 *
 * 规则:
 * - 常规战斗 max=10, 限制解除决战 max=20
 * - 每名学生基础 Regen=700, 10000 回复力 = 每秒 +1 Cost
 * - EX 施放扣减 Cost[0], 帧间逐步恢复
 * - CostChange 效果修改回复力 (临时/永久)
 *
 * 整数模型：
 * - 为避免浮点误差，内部 Cost 统一放大 COST_SCALE 倍存储。
 * - 选择 300000 = 10*30*1000? 实际为 10000*30，保证每帧回复量为整数 Regen。
 */

import type { Student } from '../../types/student'
import type { StudentLane } from '../../types/timeline'

export const COST_SCALE = 300000

export interface CostFrame {
  frame: number
  cost: number
}

export interface RegChange {
  frame: number
  regenDelta: number
  endFrame: number
}

// 已知近似：Scale 取最后一档（最高技能等级），endFrame 固定 5400 忽略效果持续时间
export function collectCostChanges(student: Student): RegChange[] {
  const changes: RegChange[] = []

  const scan = (
    effects: typeof student.Skills.E.Effects,
    applyFrame: number,
    start: number,
  ) => {
    for (const ef of effects) {
      if (ef.Type !== 'CostChange' || ef.ValueType !== 'BaseAmount') continue
      const af = ef.ApplyFrame ?? applyFrame
      const amount = ef.Scale ? ef.Scale[ef.Scale.length - 1] : 0
      changes.push({ frame: start + af, regenDelta: amount, endFrame: 5400 })
    }
  }

  scan(student.Skills.PS.Effects, 0, 0)
  scan(student.Skills.WP.Effects, 0, 0)
  scan(student.Skills.EP.Effects, 0, 0)

  return changes
}

export function computeCostTimeline(
  lanes: StudentLane[],
  mode: 'normal' | 'total_assault',
  maxFrame = 5400,
): CostFrame[] {
  const maxCost = (mode === 'normal' ? 10 : 20) * COST_SCALE
  const activeLanes = lanes.filter(l => l.student)

  if (activeLanes.length === 0) {
    return [
      { frame: 0, cost: 0 },
      { frame: maxFrame, cost: 0 },
    ]
  }

  // 基础回复力 (含被动 CostChange)
  let baseRegen = 0
  const regChanges: RegChange[] = []

  for (const lane of activeLanes) {
    baseRegen += lane.student!.Regen || 700
    for (const rc of collectCostChanges(lane.student!)) {
      regChanges.push(rc)
      if (rc.frame === 0) baseRegen += rc.regenDelta
    }
  }

  // 按生效帧排序的动态回复变化
  const startEvents = regChanges
    .filter(r => r.frame > 0)
    .sort((a, b) => a.frame - b.frame)
  const endEvents = [...regChanges]
    .filter(r => r.endFrame < maxFrame)
    .sort((a, b) => a.endFrame - b.endFrame)

  // EX 消费事件
  const casts: { frame: number; delta: number }[] = []
  for (const lane of activeLanes) {
    for (const skill of lane.skills) {
      if (skill.type !== 'ex') continue
      const cost = skill.skillCost ?? lane.student!.Skills.E.Cost[0]
      casts.push({ frame: skill.startFrame, delta: -cost * COST_SCALE })
    }
  }
  casts.sort((a, b) => a.frame - b.frame)

  let currentCost = 0
  let castIdx = 0
  let startIdx = 0
  let endIdx = 0
  const points: CostFrame[] = []

  for (let f = 0; f <= maxFrame; f++) {
    // 应用动态回复力变化
    while (startIdx < startEvents.length && startEvents[startIdx].frame === f) {
      baseRegen += startEvents[startIdx].regenDelta
      startIdx++
    }
    // 移除过期
    while (endIdx < endEvents.length && endEvents[endIdx].endFrame === f) {
      baseRegen -= endEvents[endIdx].regenDelta
      endIdx++
    }

    // 应用 EX 消耗
    while (castIdx < casts.length && casts[castIdx].frame === f) {
      currentCost += casts[castIdx].delta
      castIdx++
    }

    // 自然回复（放大后每帧增加量 = 基础 Regen）
    currentCost = Math.min(maxCost, currentCost + baseRegen)
    currentCost = Math.max(0, currentCost)

    points.push({ frame: f, cost: currentCost })
  }

  return points
}

/** 查询某个帧的 Cost 值（放大整数） */
export function costAtFrame(timeline: CostFrame[], frame: number): number {
  if (timeline.length === 0) return 0
  let lo = 0
  let hi = timeline.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (timeline[mid].frame <= frame) lo = mid
    else hi = mid - 1
  }
  return timeline[lo]?.cost ?? 0
}
