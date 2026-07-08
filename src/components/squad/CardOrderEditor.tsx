import { useState } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { StudentAvatar } from '../student-panel/StudentAvatar'
import type { Student } from '../../types/student'

export function CardOrderEditor() {
    const [collapsed, setCollapsed] = useState(false)
    const [selected, setSelected] = useState<number | null>(null)
    const slots = useSquadStore((s) => s.config.slots)
    const deckOrder = useSquadStore((s) => s.deckOrder)
    const setDeckOrder = useSquadStore((s) => s.setDeckOrder)
    const toggleDeckOrder = useSquadStore((s) => s.toggleDeckOrder)
    const mode = useSquadStore((s) => s.config.mode)

    const windowSize = mode === 'normal' ? 3 : 5
    const enabled = deckOrder !== null

    const assignedSlots = slots.filter(s => s.student)

    const ordered = deckOrder ?? []
    const orderedSet = new Set(ordered)
    const freeSlots = assignedSlots.filter(s => !orderedSet.has(s.index))

    const isOrdered = enabled && ordered.length > 0

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
                    FREE
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

    return (
        <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
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
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>牌序</span>
                    {enabled && (
                        <span className="text-[10px] font-game px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                            窗口 {windowSize}
                        </span>
                    )}
                </div>
                <button
                    onClick={toggleDeckOrder}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${enabled ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' : ''
                        }`}
                    style={{
                        background: enabled ? 'rgba(59,130,246,0.15)' : 'var(--bg-surface-alt)',
                        color: enabled ? '#60a5fa' : 'var(--text-muted)',
                        borderColor: enabled ? 'rgba(59,130,246,0.3)' : 'var(--border)',
                    }}
                >
                    {enabled ? '已启用' : '未启用'}
                </button>
            </div>

            {!collapsed && (
                <>
                    {!enabled && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            点击"已启用"按钮后自动按编队顺序生成初始牌序，并可调整顺序。
                        </p>
                    )}

                    {enabled && (
                        <div className="flex flex-col gap-2">
                            {renderOrderedCards()}

                            {!isOrdered && (
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    牌序为空，点击下方自由学生添加到牌序中。
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
                                    点击两张卡交换位置 · 悬停卡可 × 移除 · 点击 FREE 学生添加
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
