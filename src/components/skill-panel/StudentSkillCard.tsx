import { useMemo, useState } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { ExSkillCard } from './ExSkillCard'
import { ExtraSkillCard } from './ExtraSkillCard'
import { getNsSkill } from '../../utils/nsTrigger'
import { StudentAvatar } from '../student-panel/StudentAvatar'

interface StudentSkillCardProps {
    student: Student
}

/** 学校标签色 */
const SCHOOL_COLORS: Record<string, string> = {
    Abydos: '#eab308', Gehenna: '#ef4444', Millennium: '#3b82f6',
    Trinity: '#a855f7', Hyakkiyako: '#06b6d4', Arius: '#78716c',
    SRT: '#22c55e', Shanhaijing: '#f97316', Valkyrie: '#6366f1',
    RedWinter: '#ec4899', WildHunt: '#84cc16', Highlander: '#8b5cf6',
    ETC: '#6b7280',
}

const SCHOOL_LABELS: Record<string, string> = {
    Abydos: '阿比多斯', Arius: '阿里乌斯', Gehenna: '格黑娜',
    Hyakkiyako: '百鬼夜行', Millennium: '千禧年', RedWinter: '红冬',
    SRT: 'SRT', Shanhaijing: '山海经', Trinity: '三一',
    Valkyrie: '瓦尔基里', WildHunt: '狂猎', Highlander: '海兰德',
    Sakugawa: '其他', Tokiwadai: '其他', ETC: '其他',
}

const ROLE_LABELS: Record<string, string> = {
    DamageDealer: '输出', Healer: '治疗', Supporter: '辅助', Tanker: '坦克', Vehicle: '载具',
}

const ROLE_COLORS: Record<string, string> = {
    DamageDealer: '#ef4444', Healer: '#22c55e', Supporter: '#3b82f6', Tanker: '#f97316', Vehicle: '#a855f7',
}

const ARMOR_LABELS: Record<string, string> = {
    LightArmor: '轻装甲', HeavyArmor: '重装甲',
    CompositeArmor: '复合装甲', ElasticArmor: '弹力装甲', Unarmed: '特殊装甲',
}

const BULLET_COLORS: Record<string, string> = {
    Explosion: '#ef4444', Pierce: '#eab308', Mystic: '#4f90ff', Sonic: '#c97eff',
}

const BULLET_LABELS: Record<string, string> = {
    Explosion: '爆发', Pierce: '贯穿', Mystic: '神秘', Sonic: '振动',
}

const ARMOR_COLORS: Record<string, string> = {
    LightArmor: '#ef4444', HeavyArmor: '#eab308',
    CompositeArmor: '#22c55e', ElasticArmor: '#c97eff', Unarmed: '#4f90ff',
}

export function StudentSkillCard({ student }: StudentSkillCardProps) {
    const [collapsed, setCollapsed] = useState(false)
    const slots = useSquadStore((s) => s.config.slots)
    const slot = useMemo(() => slots.find((s) => s.student?.Id === student.Id), [slots, student.Id])
    const slotIndex = slot?.index ?? -1
    const nsLevel = slot?.nsLevel ?? 10
    const ssLevel = slot?.ssLevel ?? 10

    const schoolColor = SCHOOL_COLORS[student.School] || '#6b7280'
    const roleColor = ROLE_COLORS[student.TacticRole] || '#6b7280'

    const ns = getNsSkill(student)
    const ep = student.Skills.EP

    const isStriker = student.SquadType === 'Main'

    return (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            {/* ═══ 学生头部 ═══ */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                {/* 头像 */}
                <StudentAvatar student={student} size={44} />
                {/* 信息区 */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{student.Name}</span>
                        <span className="text-xs shrink-0 font-game" style={{ color: isStriker ? '#ef4444' : '#60a5fa' }}>
                            {isStriker ? 'STRIKER' : 'SPECIAL'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {/* 学校logo（暂缺时自动隐藏） */}
                        <img
                            src={`/logos/schools/${student.School}.webp`}
                            alt=""
                            className="w-4 h-4 rounded shrink-0 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${schoolColor}18`, color: schoolColor }}>
                            {SCHOOL_LABELS[student.School] || student.School}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${roleColor}18`, color: roleColor }}>
                            {ROLE_LABELS[student.TacticRole] || student.TacticRole}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${BULLET_COLORS[student.BulletType] || '#6b7280'}18`, color: BULLET_COLORS[student.BulletType] || '#6b7280' }}>
                            {BULLET_LABELS[student.BulletType] || student.BulletType}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${ARMOR_COLORS[student.ArmorType] || '#6b7280'}18`, color: ARMOR_COLORS[student.ArmorType] || '#6b7280' }}>
                            {ARMOR_LABELS[student.ArmorType] || student.ArmorType}
                        </span>
                    </div>
                </div>
                {/* 星级 */}
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {'★'.repeat(student.StarGrade)}
                </span>
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 shrink-0"
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
                                形态切换后技能
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
function NsSubCard({ student, ns, slotIndex, nsLevel }: { student: Student; ns: NonNullable<ReturnType<typeof getNsSkill>>; slotIndex: number; nsLevel: number }) {
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)

    const handleAddNs = () => {
        addSkillBlock(slotIndex, {
            type: 'ns',
            name: ns.Name,
            startFrame: 0,
            studentId: student.Id,
            targetId: student.Id,
        })
    }

    return (
        <div className="rounded-lg border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <svg className="w-3.5 h-3.5" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
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
                            {ns.Duration} 帧 · 自动触发
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5 pt-1">
                <button
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                            type: 'ns', name: ns.Name, startFrame: 0,
                            studentId: student.Id, targetId: student.Id,
                        }))
                        e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    className="text-[11px] px-2 py-0.5 rounded border cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                    ⠿ 拖拽
                </button>
                <button
                    onClick={handleAddNs}
                    className="text-[11px] px-2 py-0.5 rounded font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                    + 添加
                </button>
            </div>
        </div>
    )
}

/** SS 子卡片组件（ExtraPassive） */
function SsSubCard({ student, ep, slotIndex, ssLevel }: { student: Student; ep: Student['Skills']['EP']; slotIndex: number; ssLevel: number }) {
    const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)

    const handleAddSs = () => {
        addSkillBlock(slotIndex, {
            type: 'ss',
            name: ep.Name,
            startFrame: 0,
            studentId: student.Id,
            targetId: student.Id,
        })
    }

    return (
        <div className="rounded-lg border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <svg className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 5.5L21 11l-5.5 2.5L13 19l-2.5-5.5L5 11l5.5-2.5L13 3z" />
                    </svg>
                </div>
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
                        <span>副技能 · 常驻</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5 pt-1">
                <button
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
                            type: 'ss', name: ep.Name, startFrame: 0,
                            studentId: student.Id, targetId: student.Id,
                        }))
                        e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    className="text-[11px] px-2 py-0.5 rounded border cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                    ⠿ 拖拽
                </button>
                <button
                    onClick={handleAddSs}
                    className="text-[11px] px-2 py-0.5 rounded font-medium bg-amber-600 hover:bg-amber-500 text-white"
                >
                    + 添加
                </button>
            </div>
        </div>
    )
}
