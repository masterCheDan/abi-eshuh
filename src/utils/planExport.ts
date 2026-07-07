/**
 * 排轴方案导入/导出
 */

import type { SkillBlock, StudentLane } from '../types/timeline'
import type { Student } from '../types/student'
import { computeCostTimeline, COST_SCALE } from './costCalc'

/* ── 帧 → m:ss.ms ── */
function formatTime(totalFrames: number): string {
    const totalSeconds = Math.floor(totalFrames / 30)
    const ms = Math.round((totalFrames / 30 - totalSeconds) * 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/* ══════════════════════════════════════════════════════
   自然语言导出
   ══════════════════════════════════════════════════════ */

function collectExEvents(lanes: StudentLane[]) {
    const events: { frame: number; skill: SkillBlock; caster: Student }[] = []
    // ID→名称 映射
    const names = new Map<number, string>()
    for (const l of lanes) {
        if (l.student) names.set(l.student.Id, l.student.Name)
    }

    for (const l of lanes) {
        if (!l.student) continue
        for (const s of l.skills) {
            if (s.type === 'ex') events.push({ frame: s.startFrame, skill: s, caster: l.student })
        }
    }
    events.sort((a, b) => a.frame - b.frame)
    return { events, names }
}

export function exportNaturalLanguage(lanes: StudentLane[]): string {
    const lines: string[] = []

    // 编队
    lines.push('[编队]')
    const strikers: string[] = []
    const specials: string[] = []
    for (const l of lanes) {
        if (!l.student) continue
        if (l.student.SquadType === 'Main') strikers.push(l.student.Name)
        else specials.push(l.student.Name)
    }
    if (strikers.length) lines.push(`striker:${strikers.join(',')}`)
    if (specials.length) lines.push(`special:${specials.join(',')}`)

    // 轴
    lines.push('')
    lines.push('[轴]')
    const { events, names } = collectExEvents(lanes)
    for (const ev of events) {
        const time = formatTime(ev.frame)
        const targetId = ev.skill.targetId ?? ev.skill.studentId
        const isSelf = targetId === ev.skill.studentId
        const isBoss = targetId === -1
        const targetName = isBoss ? 'Boss' : isSelf ? '自身' : (names.get(targetId) ?? `ID:${targetId}`)
        lines.push(`${time} ${ev.caster.Name} -> ${targetName}`)
    }

    return lines.join('\n')
}

/* ══════════════════════════════════════════════════════
   自然语言导出 Mode B（基于费用）
   ══════════════════════════════════════════════════════ */

/** 计算 Cost 时间线并导出基于费用的文本 */
export function exportCostBased(lanes: StudentLane[], mode: 'normal' | 'total_assault' = 'normal'): string {
    const timeline = computeCostTimeline(lanes, mode)

    const lines: string[] = []

    // 编队
    lines.push('[编队]')
    const strikers: string[] = []
    const specials: string[] = []
    for (const l of lanes) {
        if (!l.student) continue
        if (l.student.SquadType === 'Main') strikers.push(l.student.Name)
        else specials.push(l.student.Name)
    }
    if (strikers.length) lines.push(`striker:${strikers.join(',')}`)
    if (specials.length) lines.push(`special:${specials.join(',')}`)

    // 轴
    lines.push('')
    lines.push('[轴]')
    const { events, names } = collectExEvents(lanes)

    // 查 Cost 工具
    const costAt = (frame: number): number => {
        let lo = 0, hi = timeline.length - 1
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (timeline[mid].frame <= frame) lo = mid; else hi = mid - 1 }
        return timeline[lo]?.cost ?? 0
    }

    for (const ev of events) {
        const cost = costAt(ev.frame)
        const targetId = ev.skill.targetId ?? ev.skill.studentId
        const isSelf = targetId === ev.skill.studentId
        const isBoss = targetId === -1
        const targetName = isBoss ? 'Boss' : isSelf ? '自身' : (names.get(targetId) ?? `ID:${targetId}`)
        lines.push(`[${(cost / COST_SCALE).toFixed(2)} Cost] ${ev.caster.Name} -> ${targetName}`)
    }

    return lines.join('\n')
}

/* ══════════════════════════════════════════════════════
   分享码 — 委托给 shareCode.ts
   ══════════════════════════════════════════════════════ */
export { encodeShareCode, decodeShareCode } from './shareCode'
export type { ShareCodeResult, ImportData, ImportEvent } from './shareCode'
