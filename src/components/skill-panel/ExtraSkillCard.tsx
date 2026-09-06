import { useState, useMemo } from 'react'
import type { Student, ExtraSkill } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { SkillIcon } from './SkillIcon'
import { useI18n } from '../../i18n'
import {
    canAffordSkillAtFrame,
    costBorrowLimitAtFrame,
    effectiveSkillCostAtFrame,
    COST_SCALE,
} from '../../utils/costCalc'
import { TargetPicker, type TargetOption } from './TargetPicker'
import { SummonTargetPicker } from './SummonTargetPicker'
import { rules, type SkillTargetPolicy } from '../../domain/rules/GameRules'
import { getExSkillView } from '../../domain/SkillViewService'
import { activeSummonsAtFrame } from '../../engine'

interface ExtraSkillCardProps {
    student: Student
    extraSkill: ExtraSkill
}

export function ExtraSkillCard({ student, extraSkill }: ExtraSkillCardProps) {
    const { t } = useI18n()
    const slots = useSquadStore((s) => s.config.slots)
    const allLanes = useTimelineStore((s) => s.lanes)
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
    const simulation = useSimulationStore((s) => s.result)
    const slot = useMemo(() => slots.find((value) => value.student?.Id === student.Id), [slots, student.Id])
    const slotIndex = slot?.index ?? -1
    const gearLevel = slot?.gearLevel ?? 1
    const exLevel = slot?.exLevel ?? 5

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
    const activeSummons = useMemo(() => activeSummonsAtFrame(simulation?.effectAudit, totalFrames), [simulation?.effectAudit, totalFrames])

    const skillView = useMemo(
        () => getExSkillView(student, slots, { kind: 'extra_ex', extraSkillId: extraSkill.Id }, exLevel, t.event_log.target_boss),
        [student, slots, extraSkill.Id, exLevel, t.event_log.target_boss],
    )
    const targetPolicy = (skillView?.targeting.policy ?? 'self') as SkillTargetPolicy
    const isManualTarget = skillView?.isManualTarget ?? false
    const [selectedTargets, setSelectedTargets] = useState<number[]>([])
    const [selectedSummonIds, setSelectedSummonIds] = useState<string[]>([])

    const targetOptions = useMemo<TargetOption<number>[]>(() => skillView?.availableTargets ?? [], [skillView])

    const effectiveTargets = (): number[] => {
        return isManualTarget ? selectedTargets : rules.targeting.fixedTargetIds(targetPolicy as Exclude<SkillTargetPolicy, 'select-ally' | 'select-any'>, student.Id)
    }

    // ── Cost ──
    const baseSkillCost = skillView?.cost ?? extraSkill.Cost?.[exLevel - 1] ?? extraSkill.Cost?.[0] ?? 0
    const effectiveSkillCost = effectiveSkillCostAtFrame(simulation, student.Id, totalFrames, baseSkillCost)
    const skillCost = effectiveSkillCost * COST_SCALE
    const availableCost = simulation?.costHistory[Math.max(0, Math.min(totalFrames, simulation.maxFrame))] ?? 0
    const borrowLimit = costBorrowLimitAtFrame(simulation, student.Id, totalFrames)
    const hasEnoughCost = canAffordSkillAtFrame(simulation, student.Id, totalFrames, skillCost)
    const borrowedCost = hasEnoughCost ? Math.max(0, skillCost - availableCost) : 0
    const formatCost = (value: number) => (value / COST_SCALE).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')

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
                else if (s.type === 'ns') { const p = gearLevel > 0 && st.Skills.G ? st.Skills.G : st.Skills.P; dur = p?.Duration || 60 }
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
    }, [totalFrames, extraSkill.Duration, slotIndex, allLanes, gearLevel])

    const canAct = isTimeValid && hasEnoughCost && (!isManualTarget || effectiveTargets().length + selectedSummonIds.length > 0)
    const isExecutable = extraSkill.Duration > 0

    const handleAdd = () => {
        if (!canAct || !isExecutable) return
        const targetIds = effectiveTargets()
        addSkillBlock(slotIndex, {
            type: 'ex', name: extraSkill.Name, startFrame: totalFrames,
            studentId: student.Id,
            targetId: targetIds[0] ?? student.Id,
            targetIds,
            targetSummonIds: selectedSummonIds,
            skillRef: { kind: 'extra_ex', extraSkillId: extraSkill.Id },
            triggerSource: 'manual',
            skillCost: baseSkillCost,
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
                                {t.skill.form_change}
                            </span>
                            <span className="text-[8px] px-1 py-[1px] rounded" style={{ background: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)' }}>
                                ← {student.Skills.E.Name}
                            </span>
                            {extraSkill.Cost?.length > 0 && (
                                <span className="font-game text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {baseSkillCost} COST
                                    {effectiveSkillCost !== baseSkillCost && ` → ${effectiveSkillCost}`}
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
                    <span style={{ color: 'var(--text-secondary)' }}>{totalFrames} {t.skill.frame}</span>
                    <span className="text-gray-500">·</span>
                    <span style={{ color: 'var(--text-muted)' }}>{extraSkill.Duration} {t.skill.frame}</span>
                </div>

                {isManualTarget ? <div className="mb-1.5 space-y-2"><TargetPicker options={targetOptions} selectedIds={selectedTargets} onChange={setSelectedTargets} label={t.skill.target} /><SummonTargetPicker summons={activeSummons} selectedIds={selectedSummonIds} onChange={setSelectedSummonIds} /></div> : (
                    <div className="mb-1.5 text-[10px]"><span style={{ color: 'var(--text-muted)' }}>{t.skill.target} </span><span className="rounded px-2 py-1" style={{ color: targetPolicy === 'boss' ? '#fff' : 'var(--text-secondary)', background: targetPolicy === 'boss' ? 'var(--danger)' : 'var(--bg-surface)' }}>{targetPolicy === 'self' ? t.skill.target_self : targetPolicy === 'boss' ? t.event_log.target_boss : targetPolicy === 'mixed' ? `${t.skill.target_self} / ${t.event_log.target_boss}` : '固定编队范围'}</span></div>
                )}

                {/* ── 底部操作栏（精简） ── */}
                <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    {!isTimeValid && !isNaN(totalFrames) && (
                        <span className="text-[9px] text-red-400">{t.skill.time_conflict}</span>
                    )}
                    {isTimeValid && !hasEnoughCost && !isNaN(totalFrames) && (
                        <span className="text-[9px] text-red-400">
                            {t.skill.cost_insufficient} ({formatCost(skillCost)}/{formatCost(availableCost)} COST)
                        </span>
                    )}
                    {isTimeValid && borrowedCost > 0 && (
                        <span className="text-[9px] text-amber-300">
                            {t.skill.cost_overload} ({formatCost(borrowedCost)}/{borrowLimit} COST)
                        </span>
                    )}
                    <div className="flex-1" />
                    <button
                        draggable={canAct}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                                type: 'ex', name: extraSkill.Name, startFrame: 0,
                                studentId: student.Id, targetId: effectiveTargets()[0] ?? student.Id, targetIds: effectiveTargets(), targetSummonIds: selectedSummonIds,
                                skillRef: { kind: 'extra_ex', extraSkillId: extraSkill.Id }, triggerSource: 'manual',
                                skillCost: baseSkillCost,
                                skillDuration: extraSkill.Duration || 0,
                            }))
                            e.dataTransfer.effectAllowed = 'copyMove'
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${canAct ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30'}`}
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                    >
                        ⠿
                    </button>
                    <button
                        onClick={handleAdd}
                        disabled={!canAct}
                        className={`text-[10px] rounded px-2 py-0.5 font-medium ${canAct ? 'bg-purple-600/80 hover:bg-purple-500 text-white' : 'bg-gray-600/60 text-gray-400 cursor-not-allowed'}`}
                    >
                        {t.skill.add}
                    </button>
                </div>
                    </>
                ) : (
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {t.skill.parent_triggered}
                    </div>
                )}
            </div>
        </div>
    )
}
