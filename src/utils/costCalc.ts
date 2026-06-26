/**
 * Cost 曲线计算
 *
 * 规则:
 * - 常规战斗 max=10, 限制解除决战 max=20
 * - 每名学生基础 Regen=700, 10000 回复力 = 每秒 +1 Cost
 * - EX 施放扣减 Cost[0], 帧间逐步恢复
 * - CostChange 效果修改回复力 (临时/永久)
 */

import type { StudentLane } from '../types/timeline'
import type { SquadMode } from '../types/squad'
import type { Student } from '../types/student'

function regenToPerFrame(regen: number): number {
    return (regen / 10000) / 30
}

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
    const maxCost = mode === 'normal' ? 10 : 20

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

    // 过滤掉已经在基础回复力中计入的 passive (frame===0)
    const dynamicChanges = regChanges.filter(r => r.frame > 0).sort((a, b) => a.frame - b.frame)

    // ── EX 消费事件 ──
    const casts: { frame: number; delta: number }[] = []
    for (const lane of activeLanes) {
        for (const skill of lane.skills) {
            if (skill.type !== 'ex') continue
            casts.push({ frame: skill.startFrame, delta: -(lane.student!.Skills.E.Cost[0]) })
        }
    }
    casts.sort((a, b) => a.frame - b.frame)

    // ── 合并关键帧 ──
    const keyFrames = new Set<number>([0, 5400])
    for (const c of casts) keyFrames.add(c.frame)
    for (const r of dynamicChanges) { keyFrames.add(r.frame); keyFrames.add(r.endFrame) }
    const sortedFrames = [...keyFrames].sort((a, b) => a - b)

    // ── 模拟 ──
    const result: CostFrame[] = [{ frame: 0, cost: 0 }]
    let cost = 0
    let lastFrame = 0
    let currentRegen = baseRegen
    const activeChanges: RegChange[] = []

    const rate = () => regenToPerFrame(Math.max(0, currentRegen))

    for (const frame of sortedFrames) {
        // 恢复
        const elapsed = frame - lastFrame
        if (elapsed > 0) {
            const r = rate()
            const remaining = maxCost - cost
            if (remaining > 0 && r > 0) {
                const fillFrames = Math.ceil(remaining / r)
                const capFrame = lastFrame + fillFrames
                if (capFrame < frame) {
                    result.push({ frame: capFrame, cost: maxCost })
                    lastFrame = capFrame
                    cost = maxCost
                }
            }
            const rec = frame - lastFrame
            if (rec > 0 && cost < maxCost) {
                cost = Math.min(maxCost, cost + r * rec)
            }
            if (lastFrame !== frame) {
                result.push({ frame, cost: Math.round(cost * 100) / 100 })
            }
        }

        // CostChange 生效/过期
        for (const rc of dynamicChanges.filter(r => r.frame === frame)) {
            activeChanges.push(rc)
            currentRegen += rc.regenDelta
        }
        for (let i = activeChanges.length - 1; i >= 0; i--) {
            if (activeChanges[i].endFrame === frame) {
                currentRegen -= activeChanges[i].regenDelta
                activeChanges.splice(i, 1)
            }
        }

        // EX 扣减
        for (const cast of casts.filter(c => c.frame === frame)) {
            cost = Math.max(0, cost + cast.delta)
            result.push({ frame, cost: Math.round(cost * 100) / 100 })
        }

        lastFrame = frame
    }

    // 末尾补齐
    {
        const elapsed = 5400 - lastFrame
        if (elapsed > 0 && cost < maxCost) {
            cost = Math.min(maxCost, cost + rate() * elapsed)
        }
        result.push({ frame: 5400, cost: Math.round(cost * 100) / 100 })
    }

    return result
}

/** 查询任意帧的可用 Cost */
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
    return a.cost + (b.cost - a.cost) * t
}
