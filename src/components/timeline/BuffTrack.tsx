import { useMemo } from 'react'
import type { Student } from '../../types/student'
import type { StudentLane } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { studentBuffStyle } from '../../utils/studentColors'
import { SkillIcon } from '../skill-panel/SkillIcon'
import type { BulletType } from '../../types/student'

interface BuffTrackProps {
    lane: StudentLane
    pxPerFrame: number
}

const BAR_HEIGHT = 6
const BAR_GAP = 2
const MIN_TRACK_HEIGHT = 14

function msToFrames(ms: number): number {
    if (ms <= 0) return 0
    return Math.round(ms * 30 / 1000)
}

/* ── 帧 → m:ss.ms ── */
function formatTimeMs(totalFrames: number): string {
    const totalSeconds = Math.floor(totalFrames / 30)
    const ms = Math.round((totalFrames / 30 - totalSeconds) * 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/* ── 效果属性名 → 可读中文 ── */
const STAT_LABELS: Record<string, string> = {
    AttackPower_Base: '攻击力',
    AttackPower_Coefficient: '攻击力',
    MaxHP_Base: '生命值',
    MaxHP_Coefficient: '生命值',
    DefensePower_Base: '防御力',
    DefensePower_Coefficient: '防御力',
    HealPower_Base: '治愈力',
    HealPower_Coefficient: '治愈力',
    CriticalDamageRate_Base: '暴击伤害',
    CriticalDamageRate_Coefficient: '暴击伤害',
    CriticalPoint_Base: '暴击率',
    CriticalPoint_Coefficient: '暴击率',
    AccuracyPoint_Base: '命中值',
    AccuracyPoint_Coefficient: '命中值',
    DodgePoint_Base: '闪避值',
    DodgePoint_Coefficient: '闪避值',
    SightPoint_Base: '视野值',
    StabilityPoint_Base: '安定值',
    MoveSpeed: '移动速度',
    CriticalDamageResist_Base: '暴击抵抗',
    CriticalChanceResist_Base: '暴击率抵抗',
}
function statLabel(stat: string) { return STAT_LABELS[stat] || stat }

/** Buff 力量值格式化（_Coefficient 显示百分比, _Base 显示固定值） */
function statValueText(stat: string, value: number): string {
    if (value < 0) return `${(value / 100).toFixed(1)}%`
    if (stat.endsWith('_Coefficient')) return `+${(value / 100).toFixed(1)}%`
    if (stat.endsWith('_Base')) return `+${Math.round(value)}`
    return `+${value}`
}

interface BuffBar {
  startFrame: number
  durationFrames: number
  type: string
  skillType: string
  casterName: string
  casterIcon: string
  casterBulletType: BulletType
  skillIcon: string
  casterSlot: number
  stat: string
  statValue: number
  overridden: boolean
}

function getEffects(skill: { type: string }, stu: Student): typeof stu.Skills.E.Effects {
    if (skill.type === 'ex') return stu.Skills.E.Effects
    if (skill.type === 'ns') {
        const pub = stu.HasGear ? stu.Skills.G : stu.Skills.P
        return pub.Effects
    }
    if (skill.type === 'ss') return stu.Skills.EP.Effects
    return []
}

function getDefaultApply(skill: { type: string }, stu: Student): number {
    if (skill.type === 'ex') return Math.floor(stu.Skills.E.Duration / 2)
    if (skill.type === 'ns') {
        const pub = stu.HasGear ? stu.Skills.G : stu.Skills.P
        return Math.floor((pub.Duration || 60) / 2)
    }
    return 0
}

/** 获取技能图标字段 */
function getSkillIcon(skill: { type: string }, stu: Student): string {
    if (skill.type === 'ex') return stu.Skills.E.Icon
    if (skill.type === 'ns') {
        const pub = stu.HasGear ? stu.Skills.G : stu.Skills.P
        return pub.Icon
    }
    if (skill.type === 'ss') return stu.Skills.EP.Icon
    return ''
}

function computeBuffRows(bars: BuffBar[]): number[] {
    const rows: number[] = []
    const rowEndFrames: number[] = []
    for (const bar of bars) {
        let r = 0
        while (r < rowEndFrames.length && rowEndFrames[r] > bar.startFrame) r++
        rows.push(r)
        rowEndFrames[r] = bar.startFrame + bar.durationFrames
    }
    return rows
}

export function BuffTrack({ lane, pxPerFrame }: BuffTrackProps) {
    const allLanes = useTimelineStore((s) => s.lanes)
    const { student } = lane

    const bars = useMemo(() => {
        if (!student) return [] as BuffBar[]
        const result: BuffBar[] = []

        for (const srcLane of allLanes) {
            if (!srcLane.student) continue
            const caster = srcLane.student

            for (const skill of srcLane.skills) {
                const target = skill.targetId ?? skill.studentId
                if (target !== student.Id) continue

                const effects = getEffects(skill, caster)
                const defApply = getDefaultApply(skill, caster)

                for (const ef of effects) {
                    let durMs = 0
                    let eType = ef.Type

                    if (ef.Type === 'Buff' && ef.Duration != null && ef.Duration > 0) {
                        durMs = ef.Duration
                        if (ef.Target?.includes('Enemy')) eType = 'Debuff'
                    } else if (ef.Type === 'Shield' && ef.Duration != null && ef.Duration > 0) {
                        durMs = ef.Duration
                    } else if (ef.Type === 'Regen' && ef.Duration != null && ef.Duration > 0) {
                        durMs = ef.Duration
                    } else if (ef.Type === 'CrowdControl' && ef.Scale?.length) {
                        durMs = ef.Scale[ef.Scale.length - 1]
                    } else if (ef.Type === 'DamageDebuff' && ef.Duration != null && ef.Duration > 0) {
                        durMs = ef.Duration
                    } else if (ef.Type === 'Summon' && ef.Duration != null && ef.Duration > 0) {
                        durMs = ef.Duration
                    } else {
                        continue
                    }

                    if (durMs > 0) {
                        const applyFrame = ef.ApplyFrame ?? defApply
                        let val = -1
                        if (ef.Value && ef.Value.length > 0) {
                            const lastRow = ef.Value[ef.Value.length - 1]
                            if (lastRow && lastRow.length > 0) val = lastRow[lastRow.length - 1]
                        }
                        result.push({
                            startFrame: skill.startFrame + applyFrame,
                            durationFrames: msToFrames(durMs),
                            type: eType,
                            skillType: skill.type,
                            casterName: caster.Name,
                            casterIcon: caster.Icon,
                            casterBulletType: caster.BulletType,
                            skillIcon: getSkillIcon(skill, caster),
                            casterSlot: srcLane.slotIndex,
                            stat: ef.Stat ?? '',
                            statValue: val,
                            overridden: false,
                        })
                    }
                }
            }
        }
        return result
    }, [allLanes, student])

    // ── 覆盖拆分 ──
    const resolvedBars = useMemo(() => {
        if (bars.length === 0) return [] as BuffBar[]
        const groups = new Map<string, number[]>()
        bars.forEach((b, i) => {
            const k = `${b.stat}//${b.skillType}`
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k)!.push(i)
        })
        const overrideMap = new Map<number, number>()
        for (const indices of groups.values()) {
            const sorted = [...indices].sort((a, b) => bars[a].startFrame - bars[b].startFrame)
            for (let j = 1; j < sorted.length; j++) {
                const prev = bars[sorted[j - 1]]
                const curr = bars[sorted[j]]
                if (curr.startFrame < prev.startFrame + prev.durationFrames) {
                    const ex = overrideMap.get(sorted[j - 1])
                    if (ex == null || curr.startFrame < ex) overrideMap.set(sorted[j - 1], curr.startFrame)
                }
            }
        }
        const out: BuffBar[] = []
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]
            const at = overrideMap.get(i)
            if (at != null && at > bar.startFrame) {
                const active = at - bar.startFrame
                if (active > 0) out.push({ ...bar, durationFrames: active, overridden: false })
                const gray = bar.durationFrames - active
                if (gray > 0) out.push({ ...bar, startFrame: at, durationFrames: gray, overridden: true })
            } else {
                out.push({ ...bar, overridden: false })
            }
        }
        return out
    }, [bars])

    const { buffRows, totalRows } = useMemo(() => {
        if (resolvedBars.length === 0) return { buffRows: [] as number[], totalRows: 1 }
        const rows = computeBuffRows(resolvedBars)
        return { buffRows: rows, totalRows: Math.max(...rows) + 1 }
    }, [resolvedBars])

    const trackHeight = Math.max(MIN_TRACK_HEIGHT, totalRows * (BAR_HEIGHT + BAR_GAP) + BAR_GAP)

    return (
        <div className="flex border-b" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-app)', height: trackHeight }}>
            <div className="sticky left-0 z-10 flex items-center px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <span className="text-[9px] text-gray-600 uppercase">buffs</span>
            </div>

            <div className="relative flex-1">
                {resolvedBars.map((bar, idx) => {
                    const bg = studentBuffStyle(bar.casterSlot, bar.overridden)
                    const row = buffRows[idx] ?? 0
                    const top = BAR_GAP + row * (BAR_HEIGHT + BAR_GAP)
                    const endFrame = bar.startFrame + bar.durationFrames

                    const timeRange = `${formatTimeMs(bar.startFrame)} ~ ${formatTimeMs(endFrame)}`
                    const typeUpper = bar.skillType.toUpperCase()
                    const readableStat = statLabel(bar.stat)
                    const valStr = bar.statValue >= 0 ? statValueText(bar.stat, bar.statValue) : ''
                    const hasStat = bar.stat && readableStat

                    return (
                        <div
                            key={idx}
                            className={`absolute border-l group/buff ${bar.overridden ? 'opacity-60' : ''}`}
                            style={{
                                left: bar.startFrame * pxPerFrame,
                                top,
                                width: bar.durationFrames * pxPerFrame,
                                height: BAR_HEIGHT,
                                borderRadius: '0 4px 4px 0',
                                ...bg,
                            }}
                        >
                            {/* ── 悬浮卡片（下方，防右边界截断） ── */}
                            <div className="absolute top-full right-0 mt-1 z-50 hidden group-hover/buff:block pointer-events-none">
                                <div className="rounded-lg border shadow-xl p-3 min-w-[220px] whitespace-nowrap bg-gray-800 border-gray-700 text-gray-200">
                                    {/* 1. 持续时间 */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-sm font-mono text-gray-300">
                                            ⏱ {timeRange}
                                        </span>
                                    </div>

                                    {/* 2. 来源 */}
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <img
                                            src={`/icons/${bar.casterIcon}.webp`}
                                            alt={bar.casterName}
                                            className="w-8 h-8 rounded-full shrink-0 bg-gray-700"
                                        />
                                        <span className="text-sm text-gray-200">
                                            {bar.casterName}
                                        </span>
                                        <span className="text-[11px] px-1.5 rounded bg-gray-700 text-gray-400">
                                            {typeUpper}
                                        </span>
                                        {bar.skillIcon && bar.casterBulletType && (
                                            <SkillIcon icon={bar.skillIcon} bulletType={bar.casterBulletType} size={20} />
                                        )}
                                    </div>

                                    {/* 3. 效果与数值 */}
                                    {hasStat && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="w-5 h-5 rounded bg-gray-600 flex items-center justify-center text-[9px] text-gray-400 shrink-0">
                                                B
                                            </span>
                                            <span className="text-gray-200">{readableStat}</span>
                                            {valStr && (
                                                <span className="font-mono text-gray-300">
                                                    {valStr}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
