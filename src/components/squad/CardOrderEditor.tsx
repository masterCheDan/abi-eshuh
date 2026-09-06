import { useState } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { StudentAvatar } from '../student-panel/StudentAvatar'
import type { Student } from '../../types/student'
import { useI18n, tpl } from '../../i18n'
import { useSimulationStore } from '../../stores/useSimulationStore'
import type { CardStateSnapshot } from '../../engine'

export function CardOrderEditor() {
    const { t } = useI18n()
    const [collapsed, setCollapsed] = useState(false)
    const [selected, setSelected] = useState<number | null>(null)
    const slots = useSquadStore((s) => s.config.slots)
    const deckOrder = useSquadStore((s) => s.deckOrder)
    const setDeckOrder = useSquadStore((s) => s.setDeckOrder)
    const toggleDeckOrder = useSquadStore((s) => s.toggleDeckOrder)
    const mode = useSquadStore((s) => s.config.mode)
    const runtimeWindow = useSimulationStore((s) => s.result?.window)

    const windowSize = mode === 'normal' ? 3 : 5
    // 牌序校验恒开启；该开关仅决定是否自定义初始牌序。
    const custom = deckOrder !== null

    const assignedSlots = slots.filter(s => s.student)

    const ordered = deckOrder ?? []
    const orderedSet = new Set(ordered)
    const freeSlots = assignedSlots.filter(s => !orderedSet.has(s.index))

    const isOrdered = custom && ordered.length > 0

    const handleCardClick = (slotIndex: number) => {
        if (selected === null) {
            setSelected(slotIndex)
        } else if (selected === slotIndex) {
            setSelected(null)
        } else {
            const idxA = ordered.indexOf(selected)
            const idxB = ordered.indexOf(slotIndex)
            if (idxA >= 0 && idxB >= 0) {
                const newOrder = [...ordered]
                newOrder[idxA] = ordered[idxB]
                newOrder[idxB] = ordered[idxA]
                setDeckOrder(newOrder)
            }
            setSelected(null)
        }
    }

    const handleRemoveFromOrder = (slotIndex: number) => {
        setDeckOrder(ordered.filter(i => i !== slotIndex))
        setSelected(null)
    }

    const handleAddToOrder = (slotIndex: number) => {
        setDeckOrder([...ordered, slotIndex])
    }

    const getStudentBySlot = (slotIndex: number): Student | null => {
        const slot = slots[slotIndex]
        return slot?.student ?? null
    }

    if (assignedSlots.length === 0) return null

    const renderCard = (slotIndex: number, index: number, isHand: boolean) => {
        const student = getStudentBySlot(slotIndex)
        if (!student) return null
        const isSelected = selected === slotIndex

        return (
            <div key={slotIndex} className="flex flex-col items-center gap-0.5">
                <div className="relative group">
                    <button
                        onClick={() => handleCardClick(slotIndex)}
                        className={`rounded-lg transition-all ${isHand
                            ? 'ring-2 ring-blue-400/60'
                            : 'ring-1 ring-gray-600/30'
                        } ${isSelected ? 'ring-offset-2 ring-offset-gray-800 scale-110' : ''}`}
                        style={{
                            background: isHand ? 'rgba(59,130,246,0.08)' : undefined,
                        }}
                    >
                        <StudentAvatar student={student} size={40} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromOrder(slotIndex) }}
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-[8px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        ×
                    </button>
                </div>
                <span className="text-[9px] font-mono" style={{ color: isHand ? '#60a5fa' : 'var(--text-muted)' }}>
                    {index + 1}
                </span>
            </div>
        )
    }

    const renderFreeCard = (slot: { index: number; student: Student | null }) => {
        if (!slot.student) return null
        return (
            <button
                key={slot.index}
                onClick={() => handleAddToOrder(slot.index)}
                className="flex flex-col items-center gap-0.5 p-1 rounded opacity-40 hover:opacity-80 transition-opacity"
            >
                <StudentAvatar student={slot.student} size={36} />
                <span className="text-[7px] font-game px-1 py-px rounded" style={{ background: 'rgba(107,114,128,0.2)', color: 'var(--text-muted)' }}>
                    {t.card_order.free}
                </span>
            </button>
        )
    }

    const renderOrderedCards = () => {
        if (!isOrdered) return null

        // 常规模式：一行显示
        if (mode === 'normal') {
            return (
                <div className="flex flex-wrap gap-2">
                    {ordered.map((slotIndex, i) => renderCard(slotIndex, i, i < windowSize))}
                </div>
            )
        }

        // 大决战模式：两行（手牌 + 后续牌序）
        return (
            <>
                <div className="flex flex-wrap gap-2 mb-2">
                    {ordered.slice(0, windowSize).map((slotIndex, i) => renderCard(slotIndex, i, true))}
                </div>
                {ordered.length > windowSize && (
                    <div className="flex flex-wrap gap-2">
                        {ordered.slice(windowSize).map((slotIndex, i) => renderCard(slotIndex, windowSize + i, false))}
                    </div>
                )}
            </>
        )
    }

    const renderRuntimeCard = (card: CardStateSnapshot, index: number) => {
        const student = getStudentBySlot(card.slotIndex)
        if (!student) return null
        const copiedStudent = card.copiedFromSlot == null ? null : getStudentBySlot(card.copiedFromSlot)
        const skillStudent = copiedStudent ?? student
        const extra = card.skillRef.kind === 'extra_ex'
            ? skillStudent.Skills.E.ExtraSkills?.find(skill => card.skillRef.kind === 'extra_ex' && (
                card.skillRef.extraSkillId ? skill.Id === card.skillRef.extraSkillId : false
            ))
            : null
        const title = [
            `${index + 1}. ${student.Name}`,
            extra?.Name,
            copiedStudent ? `${t.card_order.copied}: ${copiedStudent.Name}` : null,
            ...card.labels,
        ].filter(Boolean).join(' · ')

        return (
            <div key={`${card.slotIndex}-${index}`} className="relative flex flex-col items-center gap-0.5" title={title}>
                <div className="relative rounded-lg ring-1 ring-cyan-400/40 bg-cyan-400/5">
                    <StudentAvatar student={student} size={36} />
                    {card.pinned && (
                        <span className="absolute -top-1.5 -left-1.5 rounded bg-amber-500 px-1 text-[7px] font-game text-slate-950">
                            {t.card_order.pinned}
                        </span>
                    )}
                    {copiedStudent && (
                        <span className="absolute -right-1.5 -bottom-1.5 rounded-full ring-1 ring-cyan-300 bg-slate-900">
                            <StudentAvatar student={copiedStudent} size={18} />
                        </span>
                    )}
                </div>
                <span className="max-w-12 truncate text-[8px]" style={{ color: 'var(--text-muted)' }}>
                    {extra?.Name ?? card.labels[0] ?? index + 1}
                </span>
            </div>
        )
    }

    return (
        <div className="ba-panel ba-cut-panel p-3">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCollapsed(c => !c)}
                        className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        {collapsed ? '▶' : '▼'}
                    </button>
                    <span className="ba-eyebrow">{t.card_order.title}</span>
                    <span className="text-[10px] font-game px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                        {tpl(t.card_order.window, { n: windowSize })}
                    </span>
                </div>
                <button
                    onClick={toggleDeckOrder}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${custom ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' : ''
                        }`}
                    style={{
                        background: custom ? 'rgba(59,130,246,0.15)' : 'var(--bg-surface-alt)',
                        color: custom ? '#60a5fa' : 'var(--text-muted)',
                        borderColor: custom ? 'rgba(59,130,246,0.3)' : 'var(--border)',
                    }}
                >
                    {custom ? t.card_order.enabled : t.card_order.disabled}
                </button>
            </div>

            {!collapsed && (
                <>
                    {!custom && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {t.card_order.disabled_hint}
                        </p>
                    )}

                    {custom && (
                        <div className="flex flex-col gap-2">
                            {renderOrderedCards()}

                            {!isOrdered && (
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {t.card_order.empty_hint}
                                </p>
                            )}

                            {freeSlots.length > 0 && (
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                    <div className="flex flex-wrap gap-1.5">
                                        {freeSlots.map(renderFreeCard)}
                                    </div>
                                </div>
                            )}

                            {isOrdered && (
                                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                    {t.card_order.help}
                                </p>
                            )}
                        </div>
                    )}

                    {runtimeWindow && (
                        <div className="mt-1 rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-alt)' }}>
                            <div className="mb-2 text-[9px] font-game tracking-wide" style={{ color: 'var(--text-muted)' }}>
                                {t.card_order.result}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-12 shrink-0 text-[9px]" style={{ color: '#67e8f9' }}>{t.card_order.hand}</span>
                                <div className="flex flex-wrap gap-2">
                                    {runtimeWindow.hand.map(renderRuntimeCard)}
                                </div>
                            </div>
                            {runtimeWindow.drawPile.length > 0 && (
                                <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--border-light)' }}>
                                    <span className="w-12 shrink-0 text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.card_order.draw_pile}</span>
                                    <div className="flex flex-wrap gap-2 opacity-70">
                                        {runtimeWindow.drawPile.map(renderRuntimeCard)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
