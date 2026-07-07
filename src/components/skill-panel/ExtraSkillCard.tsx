import { useState, useMemo } from 'react'
import type { Student, ExtraSkill } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { SkillIcon } from './SkillIcon'
import { useI18n } from '../../i18n'
import { computeCostTimeline, costAtFrame, COST_SCALE } from '../../utils/costCalc'

/** 归一化 Target：字符串包裹为数组，undefined → [] */
function toArray(v: string | string[] | undefined): string[] {
    if (v === undefined) return []
    return typeof v === 'string' ? [v] : v
}

type TargetMode = 'none' | 'self' | 'boss' | 'striker' | 'any'

interface ExtraSkillCardProps {
    student: Student
    extraSkill: ExtraSkill
}

export function ExtraSkillCard({ student, extraSkill }: ExtraSkillCardProps) {
    const { t } = useI18n()
    const slots = useSquadStore((s) => s.config.slots)
    const allLanes = useTimelineStore((s) => s.lanes)
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
    const squadMode = useSquadStore((s) => s.config.mode)
    const costTimeline = useMemo(() => computeCostTimeline(allLanes, squadMode), [allLanes, squadMode])
    const squadStudents = useMemo(() => slots.filter((s) => s.student).map((s) => s.student!), [slots])

    const slotIndex = useMemo(() => {
        const slot = slots.find((s) => s.student?.Id === student.Id)
        return slot?.index ?? -1
    }, [slots, student.Id])

    // ── 时间输入 ──
    const [vMin, setMin] = useState('0')
    const [vSec, setSec] = useState('0')
    const [vFrame, setFrame] = useState('0')
    const [vMs, setMs] = useState('0')

    const digits = (v: string) => v.replace(/\D/g, '')
    const clamp = (v: string, lo: number, hi: number) => {
        const n = parseInt(v) || 0
        return String(Math.max(lo, Math.min(hi, n)))
    }
    const syncMsFromFrame = (fr: number) => {
        setMs(String(Math.round(Math.max(0, Math.min(29, fr)) * 1000 / 30)))
    }
    const syncFrameFromMs = (ms: number) => {
        const f = Math.round(Math.max(0, Math.min(999, ms)) * 30 / 1000)
        setFrame(String(Math.min(29, f)))
    }

    const min = parseInt(vMin) || 0
    const sec = Math.min(59, parseInt(vSec) || 0)
    const frame = Math.min(29, parseInt(vFrame) || 0)
    const msVal = Math.min(999, parseInt(vMs) || 0)
    const totalFrames = min * 1800 + sec * 30 + frame

    // ── 目标分类 ──
    const classify = useMemo(() => {
        const effects = extraSkill.Effects
        const radius = extraSkill.Radius
        const hasSummon = effects.some(ef => ef.Type === 'Summon')
        if (hasSummon) return { mode: 'none' as TargetMode, isAoe: false }

        const tags = new Set<string>()
        for (const ef of effects) {
            for (const t of toArray(ef.Target)) {
                if (t) tags.add(t)
            }
        }
        const isAoe = !!(radius && radius.length > 0)
        const hasEnemy = tags.has('Enemy')
        const hasAlly = tags.has('Ally') || tags.has('AllyMain') || tags.has('AllySupport')
        const hasSelf = tags.has('Self')
        const hasAny = tags.has('Any')
        const hasNone = tags.size === 0

        // 0) 空 Effects（纯形态切换/被动触发）→ 自身
        if (effects.length === 0) return { mode: 'self' as TargetMode, isAoe: false }

        if (hasNone) return { mode: 'boss' as TargetMode, isAoe }
        if (hasAny) return { mode: 'any' as TargetMode, isAoe }
        if (hasEnemy && hasAlly) return { mode: 'any' as TargetMode, isAoe }
        if (hasEnemy && hasSelf) return { mode: 'any' as TargetMode, isAoe }
        if (hasSelf && !hasAlly && !hasEnemy) return { mode: 'self' as TargetMode, isAoe }
        if (hasEnemy && !hasAlly) return { mode: 'boss' as TargetMode, isAoe }
        if (hasAlly) return { mode: 'striker' as TargetMode, isAoe }
        return { mode: 'boss' as TargetMode, isAoe }
    }, [extraSkill.Effects, extraSkill.Radius])

    const targetMode = classify.mode
    const isAoe = classify.isAoe
    const hasTarget = targetMode === 'boss' || targetMode === 'striker' || targetMode === 'any'

    // ── 目标选择 ──
    const [selectedTargets, setSelectedTargets] = useState<Set<number>>(() => {
        const s = new Set<number>()
        if (targetMode === 'none' || targetMode === 'self') s.add(student.Id)
        else if (targetMode === 'boss' && !isAoe) s.add(-1)
        return s
    })

    const targetOptions = useMemo(() => {
        const opts: { value: number; label: string }[] = []
        if (targetMode === 'boss' || targetMode === 'any') {
            opts.push({ value: -1, label: t.event_log.target_boss })
        }
        if (targetMode === 'striker' || targetMode === 'any') {
            for (const s of squadStudents) opts.push({ value: s.Id, label: s.Name })
        }
        return opts
    }, [targetMode, squadStudents, t.event_log.target_boss])

    const toggleTarget = (v: number) => {
        setSelectedTargets(prev => {
            const next = new Set(prev)
            if (next.has(v)) next.delete(v)
            else next.add(v)
            return next
        })
    }

    const effectiveTargets = (): number[] => {
        if (targetMode === 'none' || targetMode === 'self') return [student.Id]
        if (selectedTargets.size === 0) return [student.Id]
        return Array.from(selectedTargets)
    }

    // ── Cost ──
    const skillCost = (extraSkill.Cost?.[0] ?? 0) * COST_SCALE
    const availableCost = costAtFrame(costTimeline, totalFrames)
    const hasEnoughCost = availableCost >= skillCost

    // ── 时间冲突检查 ──
    const isTimeValid = useMemo(() => {
        if (slotIndex < 0) return false
        const footprint = extraSkill.Duration || 0
        if (footprint <= 0) return false // 无法执行的技能
        const ownSkills = allLanes.find(l => l.slotIndex === slotIndex)?.skills ?? []
        for (const s of ownSkills) {
            let dur = 60
            const st = allLanes.find(l => l.slotIndex === slotIndex)?.student
            if (st) {
                if (s.type === 'ex') dur = st.Skills.E.Duration
                else if (s.type === 'ns') { const p = st.HasGear ? st.Skills.G : st.Skills.P; dur = p.Duration || 60 }
            }
            if (totalFrames < s.startFrame + dur && totalFrames + footprint > s.startFrame) return false
        }
        const exSet = new Set<number>()
        for (const l of allLanes) {
            if (l.slotIndex === slotIndex) continue
            for (const s of l.skills) { if (s.type === 'ex') exSet.add(s.startFrame) }
        }
        if (exSet.has(totalFrames)) return false
        return true
    }, [totalFrames, extraSkill.Duration, slotIndex, allLanes])

    const canAct = isTimeValid && hasEnoughCost
    const isExecutable = extraSkill.Duration > 0

    const handleAdd = () => {
        if (!canAct || !isExecutable) return
        const targetIds = effectiveTargets()
        addSkillBlock(slotIndex, {
            type: 'ex', name: extraSkill.Name, startFrame: totalFrames,
            studentId: student.Id,
            targetId: targetIds[0] ?? student.Id,
            skillCost: extraSkill.Cost?.[0] ?? 0,
            skillDuration: extraSkill.Duration || 0,
        })
    }

    return (
        <div className="relative ml-3 pl-4 pt-1">
            {/* ── 树形连线（增强版） ── */}
            <div
                className="absolute left-0 top-0"
                style={{ width: '18px', height: '100%', pointerEvents: 'none' }}
            >
                {/* 竖线 ┃ 从顶部贯穿整个卡片 */}
                <div className="absolute" style={{
                    left: '6px', top: '0', width: '1.5px', height: '100%',
                    background: `repeating-linear-gradient(to bottom, #a855f7 0px, #a855f7 3px, transparent 3px, transparent 6px)`,
                    opacity: 0.35,
                }} />
                {/* 横线 ━ 从竖线向右接到卡片 */}
                <div className="absolute" style={{
                    left: '6px', top: '18px', width: '8px', height: '1.5px',
                    background: '#a855f7',
                    opacity: 0.5,
                }} />
                {/* 连接点 ● */}
                <div className="absolute rounded-full" style={{
                    left: '4px', top: '17px', width: '5px', height: '5px',
                    background: '#a855f7',
                    opacity: 0.6,
                }} />
            </div>

            <div
                className="rounded-lg border px-2.5 pt-2 pb-2.5"
                style={{
                    background: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)',
                    borderColor: 'rgba(168,85,247,0.2)',
                    borderLeft: '2px solid rgba(168,85,247,0.35)',
                }}
            >
                {/* ── 头部 ── */}
                <div className="flex items-center gap-1.5 mb-1">
                    <SkillIcon icon={extraSkill.Icon} bulletType={student.BulletType} size={20} />
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded font-game" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                                EX+
                            </span>
                            {extraSkill.Name}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className="text-[8px] px-1 py-[1px] rounded font-medium" style={{ background: 'rgba(168,85,247,0.08)', color: '#c084fc' }}>
                                形态切换
                            </span>
                            <span className="text-[8px] px-1 py-[1px] rounded" style={{ background: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)' }}>
                                ← {student.Skills.E.Name}
                            </span>
                            {extraSkill.Cost?.length > 0 && (
                                <span className="font-game text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {extraSkill.Cost[0]} COST
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── 可执行技能：时间输入 + 目标 + 操作 ── */}
                {isExecutable ? (
                    <>
                {/* ── 时间输入（缩小版） ── */}
                <div className="flex justify-center items-baseline gap-0.5 mb-0.5 flex-wrap text-xs font-mono">
                    <input value={vMin}
                        onChange={(e) => setMin(digits(e.target.value))}
                        onBlur={() => setMin((v) => clamp(v, 0, 5))}
                        className="w-6 text-center rounded px-0.5 py-0.5 border text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px] font-game" style={{ color: 'var(--text-muted)' }}>m</span>

                    <input value={vSec}
                        onChange={(e) => setSec(digits(e.target.value))}
                        onBlur={() => setSec((v) => clamp(v, 0, 59))}
                        className="w-6 text-center rounded px-0.5 py-0.5 border text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px] font-game" style={{ color: 'var(--text-muted)' }}>s</span>

                    <input value={vMs}
                        onChange={(e) => { const v = digits(e.target.value); setMs(v); syncFrameFromMs(parseInt(v) || 0) }}
                        onBlur={() => setMs((v) => clamp(v, 0, 999))}
                        className="w-8 text-center rounded px-0.5 py-0.5 border text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px] font-game" style={{ color: 'var(--text-muted)' }}>ms</span>

                    <span className="text-[10px] mx-0.5" style={{ color: 'var(--text-muted)' }}>/</span>

                    <input value={vFrame}
                        onChange={(e) => { const v = digits(e.target.value); setFrame(v); syncMsFromFrame(parseInt(v) || 0) }}
                        onBlur={() => setFrame((v) => clamp(v, 0, 29))}
                        className="w-6 text-center rounded px-0.5 py-0.5 border text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px] font-game" style={{ color: 'var(--text-muted)' }}>f</span>
                </div>

                {/* ── 换算 ── */}
                <div className="mb-1.5 text-[10px] font-mono flex justify-center items-center gap-2">
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {min}:{String(sec).padStart(2, '0')}.{String(msVal).padStart(3, '0')}
                    </span>
                    <span className="text-gray-500">=</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{totalFrames} 帧</span>
                    <span className="text-gray-500">·</span>
                    <span style={{ color: 'var(--text-muted)' }}>{extraSkill.Duration}帧</span>
                </div>

                {/* ── 目标选择 - AoE ── */}
                {hasTarget && isAoe && (
                    <div className="mb-1.5">
                        <div className="flex flex-wrap gap-1">
                            {targetOptions.map(opt => {
                                const checked = selectedTargets.has(opt.value)
                                return (
                                    <label
                                        key={opt.value}
                                        onClick={() => toggleTarget(opt.value)}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border cursor-pointer select-none transition-all text-[10px] ${checked
                                            ? 'border-purple-500/60 text-purple-300 font-medium'
                                            : 'border-gray-600/60 text-gray-500 hover:border-gray-500'
                                            }`}
                                        style={{ background: checked ? 'rgba(168,85,247,0.08)' : 'transparent' }}
                                    >
                                        <div className={`w-2.5 h-2.5 rounded border flex items-center justify-center transition-all ${checked ? 'bg-purple-500 border-purple-500' : 'border-gray-500'}`}>
                                            {checked && (
                                                <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        {opt.label}
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* ── 目标选择 - 非AoE ── */}
                {hasTarget && !isAoe && (
                    <div className="flex items-center gap-1.5 text-[10px] mb-1.5">
                        <span style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span>
                        {targetMode === 'boss' ? (
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t.event_log.target_boss}
                            </span>
                        ) : (
                            <select
                                value={selectedTargets.size > 0 ? Array.from(selectedTargets)[0] : ''}
                                onChange={(e) => {
                                    if (e.target.value === '') return
                                    setSelectedTargets(new Set([parseInt(e.target.value)]))
                                }}
                                className="rounded px-1.5 py-0.5 max-w-[100px] truncate border text-[10px]"
                                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                            >
                                <option value="">{t.skill.target_none}</option>
                                {targetOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                {/* ── 底部操作栏（精简） ── */}
                <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    {!isTimeValid && !isNaN(totalFrames) && (
                        <span className="text-[9px] text-red-400">时间冲突</span>
                    )}
                    {isTimeValid && !hasEnoughCost && !isNaN(totalFrames) && (
                        <span className="text-[9px] text-red-400">
                            COST不足 ({skillCost}/{availableCost.toFixed(1)})
                        </span>
                    )}
                    <div className="flex-1" />
                    <button
                        draggable={selectedTargets.size > 0}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                                type: 'ex', name: extraSkill.Name, startFrame: 0,
                                studentId: student.Id, targets: effectiveTargets(),
                                skillCost: extraSkill.Cost?.[0] ?? 0,
                                skillDuration: extraSkill.Duration || 0,
                            }))
                            e.dataTransfer.effectAllowed = 'copyMove'
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${selectedTargets.size > 0 ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30'}`}
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                    >
                        ⠿
                    </button>
                    <button
                        onClick={handleAdd}
                        disabled={!canAct}
                        className={`text-[10px] rounded px-2 py-0.5 font-medium ${canAct ? 'bg-purple-600/80 hover:bg-purple-500 text-white' : 'bg-gray-600/60 text-gray-400 cursor-not-allowed'}`}
                    >
                        + 添加
                    </button>
                </div>
                    </>
                ) : (
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        ⚡ 由父技能触发，无需手动释放
                    </div>
                )}
            </div>
        </div>
    )
}
