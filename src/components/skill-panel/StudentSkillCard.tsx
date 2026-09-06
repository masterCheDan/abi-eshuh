import { useMemo, useState } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { ExSkillCard } from './ExSkillCard'
import { ExtraSkillCard } from './ExtraSkillCard'
import { nsSkillFor } from '../../domain/student'
import { StudentAvatar } from '../student-panel/StudentAvatar'
import { SkillIcon } from './SkillIcon'
import { useBossStore } from '../../stores/useBossStore'
import { useI18n, tpl } from '../../i18n'
import { TargetPicker } from './TargetPicker'
import { SummonTargetPicker } from './SummonTargetPicker'
import { rules, type SkillTargetPolicy } from '../../domain/rules/GameRules'
import { StudentRankSelector } from '../squad/StudentRankSelector'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { activeSummonsAtFrame } from '../../engine'
import { automaticNsError } from '../../domain/triggerEvidence'

interface StudentSkillCardProps {
    student: Student
}

const BULLET_COLORS: Record<string, string> = {
    Explosion: '#ef4444', Pierce: '#eab308', Mystic: '#4f90ff', Sonic: '#c97eff',
}

const ARMOR_COLORS: Record<string, string> = {
    LightArmor: '#ef4444', HeavyArmor: '#eab308',
    CompositeArmor: '#22c55e', ElasticArmor: '#c97eff', Unarmed: '#4f90ff',
}

const TERRAIN_KEYS = ['Street', 'Outdoor', 'Indoor'] as const

type ManualTargetPolicy = Extract<SkillTargetPolicy, 'select-ally' | 'select-any'>

function resolvedTargetIds(policy: SkillTargetPolicy, studentId: number, selected: number[]): number[] {
    return policy === 'select-ally' || policy === 'select-any' ? selected : rules.targeting.fixedTargetIds(policy, studentId)
}

export function StudentSkillCard({ student }: StudentSkillCardProps) {
    const { t } = useI18n()
    const [collapsed, setCollapsed] = useState(false)
    const slots = useSquadStore((s) => s.config.slots)
    const slot = useMemo(() => slots.find((s) => s.student?.Id === student.Id), [slots, student.Id])
    const slotIndex = slot?.index ?? -1
    const nsLevel = slot?.nsLevel ?? 10
    const ssLevel = slot?.ssLevel ?? 10
    const selectedBossTerrain = useBossStore((s) => s.selectedTerrain)


    const gearLevel = slot?.gearLevel ?? 1
    const ns = nsSkillFor(student, gearLevel)
    const ep = student.Skills.EP

    const isStriker = student.SquadType === 'Main'

    return (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            {/* ═══ 学生头部 ═══ */}
            <div className="flex items-start gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                {/* 头像 */}
                <div className="shrink-0 pt-0.5">
                    <StudentAvatar student={student} size={44} />
                </div>
                {/* 信息区 */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{student.Name}</span>
                        <span className="text-xs shrink-0 font-game" style={{ color: isStriker ? '#ef4444' : '#60a5fa' }}>
                            {isStriker ? 'STRIKER' : 'SPECIAL'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {/* 学校logo */}
                        <img
                            src={`${import.meta.env.BASE_URL}logos/schools/${student.School}.png`}
                            alt=""
                            className="w-4 h-4 rounded shrink-0 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        {/* 角色定位图标 */}
                        <img
                            src={`${import.meta.env.BASE_URL}ui/Role_${student.TacticRole}.png`}
                            alt=""
                            className="w-4 h-4 object-contain"
                            title={t.role[student.TacticRole] || student.TacticRole}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${BULLET_COLORS[student.BulletType] || '#6b7280'}18`, color: BULLET_COLORS[student.BulletType] || '#6b7280' }}>
                            {t.bullet[student.BulletType] || student.BulletType}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${ARMOR_COLORS[student.ArmorType] || '#6b7280'}18`, color: ARMOR_COLORS[student.ArmorType] || '#6b7280' }}>
                            {t.armor[student.ArmorType] || student.ArmorType}
                        </span>
                        <span className="mx-0.5 h-3 w-px shrink-0" style={{ background: 'var(--border-light)' }} />
                        {/* 地形适性 */}
                        <div className="flex items-center gap-1">
                            {TERRAIN_KEYS.map((key) => {
                                const adaptValue = student[key] as number
                                const isActive = key === selectedBossTerrain
                                return (
                                    <div
                                        key={key}
                                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg ${isActive ? 'border' : ''}`}
                                        style={{
                                            background: isActive ? 'var(--accent-soft)' : 'transparent',
                                            borderColor: isActive ? 'var(--accent)' : 'transparent',
                                        }}
                                    >
                                        <img
                                            src={`${import.meta.env.BASE_URL}ui/Terrain_${key}.png`}
                                            alt=""
                                            className="w-3.5 h-3.5 object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        />
                                        <img
                                            src={`${import.meta.env.BASE_URL}ui/Adaptresult${adaptValue}.png`}
                                            alt=""
                                            className="w-3 h-3 object-contain"
                                            title={tpl(t.skill.terrain_adapt, { terrain: t.terrain[key] })}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    {slot && (
                        <div className="mt-1.5 space-y-1.5">
                            <StudentRankSelector slotIndex={slot.index} />
                            {student.HasGear && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.skill.gear_title}</span>
                                    <select
                                        value={slot.gearLevel}
                                        onChange={(e) => useSquadStore.getState().setGearLevel(slot.index, Number(e.target.value) as 0 | 1 | 2)}
                                        className="text-[10px] px-1 py-0.5 rounded border"
                                        style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                                    >
                                        <option value={0}>{t.skill.gear_none}</option>
                                        <option value={1}>T1</option>
                                        <option value={2}>T2</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="mt-0.5 text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                >
                    {collapsed ? '▶' : '▼'}
                </button>
            </div>

            {!collapsed && (
            <div className="p-3 space-y-2">
                {/* ── EX 子卡片 ── */}
                <ExSkillCard student={student} />

                {/* ── ExtraSkills（形态切换后技能） ── */}
                {student.Skills.E.ExtraSkills && student.Skills.E.ExtraSkills.length > 0 && (
                    <div className="relative">
                        {/* 从属关系标签 */}
                        <div className="flex items-center gap-1.5 mb-1 ml-3">
                            <svg className="w-3 h-3" style={{ color: '#a855f7' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-[9px] font-medium" style={{ color: '#c084fc' }}>
                                {t.skill.extra_skills}
                            </span>
                        </div>
                        {student.Skills.E.ExtraSkills.map((es, i) => (
                            <ExtraSkillCard key={es.Id || i} student={student} extraSkill={es} />
                        ))}
                    </div>
                )}

                {/* ── NS 子卡片 ── */}
                {ns && (
                    <NsSubCard student={student} ns={ns} slotIndex={slotIndex} nsLevel={nsLevel} />
                )}

                {/* ── SS 子卡片（ExtraPassive） ── */}
                {ep && ep.Name && (
                    <SsSubCard student={student} ep={ep} slotIndex={slotIndex} ssLevel={ssLevel} />
                )}
            </div>
            )}
        </div>
    )
}

/** NS 子卡片组件 */
function NsSubCard({ student, ns, slotIndex, nsLevel }: { student: Student; ns: NonNullable<ReturnType<typeof nsSkillFor>>; slotIndex: number; nsLevel: number }) {
    const { t } = useI18n()
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
    const slots = useSquadStore((s) => s.config.slots)
    const gearLevel = slots[slotIndex]?.gearLevel ?? 1
    const squadStudents = useMemo(() => slots.filter(slot => slot.student).map(slot => slot.student!), [slots])
    const [targetIds, setTargetIds] = useState<number[]>([])
    const [targetSummonIds, setTargetSummonIds] = useState<string[]>([])
    const simulation = useSimulationStore((s) => s.result)
    const activeSummons = useMemo(() => activeSummonsAtFrame(simulation?.effectAudit, 0), [simulation?.effectAudit])
    const ref = gearLevel > 0 && student.Skills.G ? { kind: 'gear_public' } as const : { kind: 'public' } as const
    const nsRule = rules.nsTrigger.rule(student.Id)
    const needsConfirmation = automaticNsError(student, ref, ns.Effects, gearLevel, nsRule?.kind === 'interval' ? nsRule.seconds * 30 : 0) != null
    const policy = rules.targeting.policy(ns.Effects)
    const selectedTargetIds = resolvedTargetIds(policy, student.Id, targetIds)

    const handleAddNs = () => {
        addSkillBlock(slotIndex, {
            type: 'ns',
            name: ns.Name,
            startFrame: 0,
            studentId: student.Id,
            targetId: selectedTargetIds[0] ?? student.Id,
            targetIds: selectedTargetIds,
            targetSummonIds,
            skillRef: ref,
            triggerSource: 'manual',
        })
    }

    return (
        <div className="rounded-lg border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <SkillIcon icon={ns.Icon} bulletType={student.BulletType} size={24} />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        <span className="text-[10px] font-bold uppercase px-1 py-0.5 rounded font-game" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>NS</span>
                        <select
                            value={nsLevel}
                            onChange={(e) => useSquadStore.getState().setSkillLevel(slotIndex, 'ns', Number(e.target.value))}
                            className="text-[9px] px-1 py-0.5 rounded border"
                            style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                        >
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((l) => (
                                <option key={l} value={l}>Lv.{l}</option>
                            ))}
                        </select>
                        {ns.Name}
                    </div>
                    {ns.Duration && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {tpl(needsConfirmation ? t.skill.ns_manual : t.skill.ns_auto, { n: ns.Duration })}
                        </div>
                    )}
                </div>
            </div>
            <div className="px-3 pb-1">
                {isManualTargetPolicy(policy) ? <div className="space-y-2"><TargetPicker options={targetOptions(policy, squadStudents, t.event_log.target_boss)} selectedIds={targetIds} onChange={setTargetIds} label={t.skill.target} /><SummonTargetPicker summons={activeSummons} selectedIds={targetSummonIds} onChange={setTargetSummonIds} /></div>
                    : <FixedTarget policy={policy} t={t} />}
            </div>
            <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5 pt-1">
                <button
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                            type: 'ns', name: ns.Name, startFrame: 0,
                            studentId: student.Id, targetId: selectedTargetIds[0] ?? student.Id, targetIds: selectedTargetIds, targetSummonIds, skillRef: ref, triggerSource: 'manual',
                        }))
                        e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    className="text-[11px] px-2 py-0.5 rounded border cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                    {t.skill.drag}
                </button>
                <button
                    onClick={handleAddNs}
                    className="text-[11px] px-2 py-0.5 rounded font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                    {t.skill.add}
                </button>
            </div>
        </div>
    )
}

/** SS 子卡片组件（ExtraPassive） */
function SsSubCard({ student, ep, slotIndex, ssLevel }: { student: Student; ep: Student['Skills']['EP']; slotIndex: number; ssLevel: number }) {
    const { t } = useI18n()
    const autoSs = rules.skill.selfExBuffEpIds.has(student.Id)
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
    const slots = useSquadStore((s) => s.config.slots)
    const squadStudents = useMemo(() => slots.filter(slot => slot.student).map(slot => slot.student!), [slots])
    const [targetIds, setTargetIds] = useState<number[]>([])
    const [targetSummonIds, setTargetSummonIds] = useState<string[]>([])
    const simulation = useSimulationStore((s) => s.result)
    const activeSummons = useMemo(() => activeSummonsAtFrame(simulation?.effectAudit, 0), [simulation?.effectAudit])
    const policy = rules.targeting.policy(ep.Effects)
    const selectedTargetIds = resolvedTargetIds(policy, student.Id, targetIds)

    const handleAddSs = () => {
        addSkillBlock(slotIndex, {
            type: 'ss',
            name: ep.Name,
            startFrame: 0,
            studentId: student.Id,
            targetId: selectedTargetIds[0] ?? student.Id,
            targetIds: selectedTargetIds,
            targetSummonIds,
            skillRef: { kind: 'extra_passive' }, triggerSource: 'manual',
        })
    }

    return (
        <div className="rounded-lg border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <SkillIcon icon={ep.Icon} bulletType={student.BulletType} size={24} />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        <span className="text-[10px] font-bold uppercase px-1 py-0.5 rounded font-game" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>SS</span>
                        <select
                            value={ssLevel}
                            onChange={(e) => useSquadStore.getState().setSkillLevel(slotIndex, 'ss', Number(e.target.value))}
                            className="text-[9px] px-1 py-0.5 rounded border"
                            style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                        >
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((l) => (
                                <option key={l} value={l}>Lv.{l}</option>
                            ))}
                        </select>
                        {ep.Name}
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        <span>{t.skill.ss_passive}</span>
                    </div>
                </div>
            </div>
            <div className="px-3 pb-1">
                {isManualTargetPolicy(policy) ? <div className="space-y-2"><TargetPicker options={targetOptions(policy, squadStudents, t.event_log.target_boss)} selectedIds={targetIds} onChange={setTargetIds} label={t.skill.target} /><SummonTargetPicker summons={activeSummons} selectedIds={targetSummonIds} onChange={setTargetSummonIds} /></div>
                    : <FixedTarget policy={policy} t={t} />}
            </div>
            <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5 pt-1">
                {autoSs ? (
                    <span className="text-[10px] px-2 py-1 rounded" style={{ color: 'var(--accent-2)', background: 'rgba(245,158,11,0.12)' }}>
                        {t.skill.parent_triggered}
                    </span>
                ) : (
                    <>
                        <button
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                                    type: 'ss', name: ep.Name, startFrame: 0,
                                    studentId: student.Id, targetId: selectedTargetIds[0] ?? student.Id, targetIds: selectedTargetIds, targetSummonIds,
                                    skillRef: { kind: 'extra_passive' }, triggerSource: 'manual',
                                }))
                                e.dataTransfer.effectAllowed = 'copyMove'
                            }}
                            className="text-[11px] px-2 py-0.5 rounded border cursor-grab active:cursor-grabbing"
                            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                        >
                            {t.skill.drag}
                        </button>
                        <button
                            onClick={handleAddSs}
                            className="text-[11px] px-2 py-0.5 rounded font-medium bg-amber-600 hover:bg-amber-500 text-white"
                        >
                            {t.skill.add}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

function isManualTargetPolicy(policy: SkillTargetPolicy): policy is ManualTargetPolicy {
    return policy === 'select-ally' || policy === 'select-any'
}

function targetOptions(policy: ManualTargetPolicy, students: Student[], bossLabel: string) {
    const allies = students.map(target => ({ id: target.Id, label: target.Name }))
    return policy === 'select-any' ? [{ id: -1, label: bossLabel }, ...allies] : allies
}

function FixedTarget({ policy, t }: { policy: Exclude<SkillTargetPolicy, ManualTargetPolicy>; t: ReturnType<typeof useI18n>['t'] }) {
    const label = policy === 'self' ? t.skill.target_self : policy === 'boss' ? t.event_log.target_boss : policy === 'mixed' ? `${t.skill.target_self} / ${t.event_log.target_boss}` : '固定编队范围'
    return <div className="flex items-center gap-1.5 text-[10px]"><span style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span><span className="rounded px-2 py-1" style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)' }}>{label}</span></div>
}
