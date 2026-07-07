/**
 * Cost 曲线计算
 *
 * 规则:
 * - 常规战斗 max=10, 限制解除决战 max=20
 * - 每名学生基础 Regen=700, 10000 回复力 = 每秒 +1 Cost
 * - EX 施放扣减 Cost[0], 帧间逐步恢复
 * - CostChange 效果修改回复力 (临时/永久)
 *
 * 整数模型：内部 Cost 统一放大 COST_SCALE 倍，避免浮点误差。
 */

import type { StudentLane } from '../types/timeline'
import type { SquadMode } from '../types/squad'
import type { Student } from '../types/student'

export const COST_SCALE = 300000

export interface CostFrame { frame: number; cost: number }

interface RegChange { frame: number; regenDelta: number; endFrame: number }

/** 扫描一位学生所有技能, 提取 CostChange 效果 */
function collectCostChanges(student: Student): RegChange[] {
    const changes: RegChange[] = []

    const scan = (effects: typeof student.Skills.E.Effects, applyFrame: number, start: number) => {
        for (const ef of effects) {
            if (ef.Type !== 'CostChange' || ef.ValueType !== 'BaseAmount') continue
            const af = ef.ApplyFrame ?? applyFrame
            const amount = ef.Scale ? ef.Scale[ef.Scale.length - 1] : 0
            changes.push({ frame: start + af, regenDelta: amount, endFrame: 5400 })
        }
    }

    // 被动技能 (常驻, 帧 0 生效)
    scan(student.Skills.PS.Effects, 0, 0)
    scan(student.Skills.WP.Effects, 0, 0)
    scan(student.Skills.EP.Effects, 0, 0)

    return changes
}

export function computeCostTimeline(
    lanes: StudentLane[],
    mode: SquadMode,
): CostFrame[] {
    const maxCost = (mode === 'normal' ? 10 : 20) * COST_SCALE

    const activeLanes = lanes.filter(l => l.student)
    if (activeLanes.length === 0) {
        return [{ frame: 0, cost: 0 }, { frame: 5400, cost: 0 }]
    }

    // 基础回复力 (含被动 CostChange 修正)
    let baseRegen = 0
    const regChanges: RegChange[] = []

    for (const lane of activeLanes) {
        baseRegen += lane.student!.Regen || 700
        for (const rc of collectCostChanges(lane.student!)) {
            regChanges.push(rc)
            // 被动 (frame===0) 直接加入基础回复力
            if (rc.frame === 0) baseRegen += rc.regenDelta
        }
    }

    // 按生效帧排序的动态回复变化
    const startEvents = regChanges
        .filter(r => r.frame > 0)
        .sort((a, b) => a.frame - b.frame)
    const endEvents = [...regChanges]
        .filter(r => r.endFrame < 5400)
        .sort((a, b) => a.endFrame - b.endFrame)

    // ── EX 消费事件 ──
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

    for (let f = 0; f <= 5400; f++) {
        // 应用动态回复力变化
        while (startIdx < startEvents.length && startEvents[startIdx].frame === f) {
            baseRegen += startEvents[startIdx].regenDelta
            startIdx++
        }
        while (endIdx < endEvents.length && endEvents[endIdx].endFrame === f) {
            baseRegen -= endEvents[endIdx].regenDelta
            endIdx++
        }

        // EX 扣减
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

/** 查询任意帧的可用 Cost（放大整数） */
export function costAtFrame(timeline: CostFrame[], f: number): number {
    if (timeline.length === 0) return 0
    let hi = 0
    while (hi < timeline.length && timeline[hi].frame <= f) hi++
    if (hi === 0) return timeline[0].cost
    if (hi === timeline.length) return timeline[timeline.length - 1].cost
    const lo = hi - 1
    const a = timeline[lo], b = timeline[hi]
    if (a.frame === b.frame) return a.cost
    const t = (f - a.frame) / (b.frame - a.frame)
    return Math.round(a.cost + (b.cost - a.cost) * t)
}
