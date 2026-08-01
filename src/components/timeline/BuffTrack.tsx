import { useMemo } from 'react'
import type { Student, BulletType } from '../../types/student'
import type { StudentLane } from '../../types/timeline'
import type { SkillRef } from '../../engine/model/types'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { studentBuffStyle } from '../../utils/studentColors'
import { SkillIcon } from '../skill-panel/SkillIcon'
import {
    buildBuffTrackItems,
    effectStackCount,
    layoutBuffTrackItems,
    PERSISTENT_MARKER_WIDTH,
    type BuffEffectLifetime,
} from './buffTrackModel'

interface BuffTrackProps {
    lane: StudentLane
    pxPerFrame: number
}

const TIMED_BAR_HEIGHT = 6
const PERSISTENT_MARKER_HEIGHT = 18
const ROW_HEIGHT = 20
const TRACK_PADDING = 2
const MIN_TRACK_HEIGHT = 22

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
    RegenCost_Base: 'Cost 回复',
    RegenCost_Coefficient: 'Cost 回复',
    CostChange: 'EX Cost',
    CriticalDamageResist_Base: '暴击抵抗',
    CriticalChanceResist_Base: '暴击率抵抗',
}

function statLabel(stat: string) {
    return STAT_LABELS[stat] || stat
}

/** Buff 力量值格式化（_Coefficient 显示百分比, _Base 显示固定值） */
function statValueText(stat: string, value: number): string {
    if (value < 0) return `${(value / 100).toFixed(1)}%`
    if (stat.endsWith('_Coefficient')) return `+${(value / 100).toFixed(1)}%`
    if (stat.endsWith('_Base')) return `+${Math.round(value)}`
    return `+${value}`
}

function getSkillPresentation(ref: SkillRef, student: Student): { type: string; icon: string } {
    if (ref.kind === 'ex') return { type: 'EX', icon: student.Skills.E.Icon }
    if (ref.kind === 'extra_ex') {
        const extra = (student.Skills.E.ExtraSkills ?? []).find((skill, index) =>
            ref.extraSkillId ? skill.Id === ref.extraSkillId : index === (ref.extraSkillIndex ?? 0))
        return { type: 'EX+', icon: extra?.Icon ?? student.Skills.E.Icon }
    }
    if (ref.kind === 'public') return { type: 'NS', icon: student.Skills.P.Icon }
    if (ref.kind === 'gear_public') return { type: 'NS+', icon: student.Skills.G?.Icon ?? student.Skills.P.Icon }
    if (ref.kind === 'passive') return { type: 'PS', icon: student.Skills.PS.Icon }
    if (ref.kind === 'weapon_passive') return { type: 'PS+', icon: student.Skills.WP.Icon }
    return { type: 'SS', icon: student.Skills.EP.Icon }
}

interface PresentedEffect {
    lifetime: BuffEffectLifetime
    skillType: string
    casterName: string
    casterIcon: string
    casterBulletType: BulletType
    skillIcon: string
    casterSlot: number
    stat: string
    statValue?: number
    stacks: number
    uses?: number
}

function presentEffect(effect: BuffEffectLifetime, lanes: StudentLane[]): PresentedEffect | null {
    const casterLane = lanes.find(source => source.student?.Id === effect.record.issuerId)
    const caster = casterLane?.student
    if (!caster || casterLane == null) return null
    const skill = getSkillPresentation(effect.record.skillRef, caster)
    return {
        lifetime: effect,
        skillType: skill.type,
        casterName: caster.Name,
        casterIcon: caster.Icon,
        casterBulletType: caster.BulletType,
        skillIcon: skill.icon,
        casterSlot: casterLane.slotIndex,
        stat: effect.record.stat ?? effect.record.detail?.split('=')[0] ?? effect.record.effectType,
        statValue: effect.record.value,
        stacks: effectStackCount(effect.record),
        uses: effect.record.uses,
    }
}

function effectValueText(effect: PresentedEffect): string {
    if (effect.lifetime.record.effectType !== 'CostChange' || effect.statValue == null) {
        return effect.statValue == null ? '' : statValueText(effect.stat, effect.statValue)
    }
    return effect.lifetime.record.valueType === 'Coefficient'
        ? `${(effect.statValue / 100).toFixed(0)}%`
        : `${effect.statValue > 0 ? '+' : ''}${effect.statValue} Cost`
}

interface EffectTooltipProps {
    effects: PresentedEffect[]
    startFrame: number
    endFrame?: number
}

function EffectTooltip({ effects, startFrame, endFrame }: EffectTooltipProps) {
    const persistent = endFrame == null
    return (
        <div className="rounded-lg border shadow-xl p-3 w-[300px] bg-gray-800 border-gray-700 text-gray-200">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-gray-300">
                    {persistent
                        ? `∞ ${formatTimeMs(startFrame)} 生效 · 持续至战斗结束`
                        : `⏱ ${formatTimeMs(startFrame)} ~ ${formatTimeMs(endFrame)}`}
                </span>
            </div>
            <div className="space-y-2">
                {effects.map(effect => {
                    const readableStat = statLabel(effect.stat)
                    const valStr = effectValueText(effect)
                    return (
                        <div
                            key={effect.lifetime.auditIndex}
                            className="flex items-center gap-2 border-t border-gray-700/70 pt-2 first:border-0 first:pt-0"
                        >
                            <img
                                src={`${import.meta.env.BASE_URL}icons/${effect.casterIcon}.webp`}
                                alt={effect.casterName}
                                className="w-8 h-8 rounded-lg shrink-0 bg-gray-700"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm text-gray-200 truncate">{effect.casterName}</span>
                                    <span className="text-xs px-1.5 rounded bg-gray-700 text-gray-400">
                                        {effect.skillType}
                                    </span>
                                    {effect.skillIcon && effect.casterBulletType && (
                                        <SkillIcon icon={effect.skillIcon} bulletType={effect.casterBulletType} size={18} />
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                                    <span className="text-gray-300">{readableStat}</span>
                                    {valStr && <span className="font-mono text-gray-400">{valStr}</span>}
                                    {effect.stacks > 1 && (
                                        <span className="rounded bg-gray-700 px-1 text-gray-400">×{effect.stacks} 层</span>
                                    )}
                                    {effect.uses != null && (
                                        <span className="rounded bg-gray-700 px-1 text-gray-400">{effect.uses} 次</span>
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

export function BuffTrack({ lane, pxPerFrame }: BuffTrackProps) {
    // 订阅主题以触发 studentBuffStyle 重算
    useThemeStore((state) => state.resolved)
    const allLanes = useTimelineStore((state) => state.lanes)
    const simulation = useSimulationStore((state) => state.result)
    const { student } = lane

    const items = useMemo(() => {
        if (!student || !simulation) return []
        return buildBuffTrackItems(simulation.effectAudit, student.Id, simulation.maxFrame)
    }, [simulation, student])

    const layout = useMemo(
        () => layoutBuffTrackItems(items, pxPerFrame),
        [items, pxPerFrame],
    )
    const trackHeight = Math.max(MIN_TRACK_HEIGHT, layout.totalRows * ROW_HEIGHT + TRACK_PADDING * 2)

    return (
        <div
            className="flex border-b"
            style={{ borderColor: 'var(--border-light)', background: 'var(--bg-app)', height: trackHeight }}
        >
            <div
                className="sticky left-0 z-10 flex items-center justify-center px-2 border-r shrink-0 w-20"
                style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}
            >
                <span className="text-xs font-game text-gray-300 uppercase">buffs</span>
            </div>

            <div className="relative flex-1">
                {items.map((item, index) => {
                    const row = layout.rows[index] ?? 0
                    const rowTop = TRACK_PADDING + row * ROW_HEIGHT

                    if (item.kind === 'persistent') {
                        const effects = item.effects
                            .map(effect => presentEffect(effect, allLanes))
                            .filter((effect): effect is PresentedEffect => effect != null)
                        if (effects.length === 0) return null
                        const bg = studentBuffStyle(effects[0].casterSlot)
                        const label = effects.length > 1 ? `∞ ×${effects.length}` : '∞'
                        return (
                            <div
                                key={`persistent-${item.startFrame}-${item.effects.map(effect => effect.auditIndex).join('-')}`}
                                className="absolute group/persistent z-[2]"
                                style={{
                                    left: item.startFrame * pxPerFrame,
                                    top: rowTop,
                                    width: PERSISTENT_MARKER_WIDTH,
                                    height: PERSISTENT_MARKER_HEIGHT,
                                }}
                            >
                                <button
                                    type="button"
                                    aria-label={`${formatTimeMs(item.startFrame)} 生效的常驻效果，共 ${effects.length} 项`}
                                    className="w-full h-full rounded-full border border-white/10 text-[10px] font-mono font-semibold text-gray-100 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-300"
                                    style={bg}
                                >
                                    {label}
                                </button>
                                <div className="absolute top-full left-0 mt-1 z-50 hidden group-hover/persistent:block group-focus-within/persistent:block pointer-events-none">
                                    <EffectTooltip effects={effects} startFrame={item.startFrame} />
                                </div>
                            </div>
                        )
                    }

                    const effect = presentEffect(item, allLanes)
                    if (!effect) return null
                    const width = Math.max(2, (item.endFrame - item.startFrame) * pxPerFrame)
                    return (
                        <div
                            key={`timed-${item.auditIndex}`}
                            className="absolute group/timed"
                            style={{
                                left: item.startFrame * pxPerFrame,
                                top: rowTop + (PERSISTENT_MARKER_HEIGHT - TIMED_BAR_HEIGHT) / 2,
                                width,
                                height: TIMED_BAR_HEIGHT,
                            }}
                        >
                            <button
                                type="button"
                                aria-label={`${effect.casterName} ${effect.skillType}，${formatTimeMs(item.startFrame)} 至 ${formatTimeMs(item.endFrame)}`}
                                className="block w-full h-full rounded-r border-l focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-300"
                                style={studentBuffStyle(effect.casterSlot)}
                            />
                            <div className="absolute top-full right-0 mt-1 z-50 hidden group-hover/timed:block group-focus-within/timed:block pointer-events-none">
                                <EffectTooltip
                                    effects={[effect]}
                                    startFrame={item.startFrame}
                                    endFrame={item.endFrame}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
