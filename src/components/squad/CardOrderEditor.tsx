/**
 * 初始牌序编辑器
 *
 * 允许用户设置在战斗开始时的手牌顺序 (deckOrder)。
 * 启用后，引擎只会允许初始窗口内的学生释放 EX。
 * 窗口大小: 常规 4+2 → 3 张, 大决战 6+4 → 5 张
 */

import { useSquadStore } from '../../stores/useSquadStore'

export function CardOrderEditor() {
    const slots = useSquadStore((s) => s.config.slots)
    const deckOrder = useSquadStore((s) => s.deckOrder)
    const setDeckOrder = useSquadStore((s) => s.setDeckOrder)
    const toggleDeckOrder = useSquadStore((s) => s.toggleDeckOrder)

    const assignedSlots = slots.filter(s => s.student)
    const mode = useSquadStore((s) => s.config.mode)
    const windowSize = mode === 'normal' ? 3 : 5
    const enabled = deckOrder !== null

    const moveCard = (index: number, direction: -1 | 1) => {
        if (!deckOrder) return
        const newOrder = [...deckOrder]
        const target = index + direction
        if (target < 0 || target >= newOrder.length) return
            ;[newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
        setDeckOrder(newOrder)
    }

    if (assignedSlots.length === 0) return null

    return (
        <div className="rounded-lg p-3 border mt-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
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

            {!enabled && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    点击"已启用"按钮后自动按编队顺序生成初始牌序，并可拖拽调整顺序。
                </p>
            )}

            {enabled && deckOrder && (
                <>
                    <div className="space-y-1 mb-2">
                        {deckOrder.map((slotIndex, i) => {
                            const slot = slots[slotIndex]
                            if (!slot?.student) return null
                            const student = slot.student
                            const inWindow = i < windowSize
                            const consumed = i < 0 // 尚未消耗

                            return (
                                <div
                                    key={slotIndex}
                                    className={`flex items-center gap-2 px-2 py-1 rounded transition-all ${inWindow ? 'opacity-100' : 'opacity-40'
                                        }`}
                                    style={{
                                        background: inWindow ? 'rgba(59,130,246,0.06)' : 'transparent',
                                        borderLeft: inWindow ? '2px solid rgba(59,130,246,0.4)' : '2px solid transparent',
                                    }}
                                >
                                    {/* 序号 */}
                                    <span className="text-[10px] font-mono shrink-0 w-4 text-center" style={{ color: 'var(--text-muted)' }}>
                                        {i + 1}
                                    </span>

                                    {/* 头像首字母 */}
                                    <div
                                        className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                        style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)' }}
                                    >
                                        {student.Name.charAt(0)}
                                    </div>

                                    {/* 姓名 */}
                                    <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                                        {student.Name}
                                    </span>

                                    {/* 窗口 / 槽位标记 */}
                                    {inWindow && (
                                        <span className="text-[8px] font-game px-1 py-px rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                                            手牌
                                        </span>
                                    )}
                                    {consumed && (
                                        <span className="text-[8px] px-1 py-px rounded" style={{ background: 'rgba(107,114,128,0.15)', color: 'var(--text-muted)' }}>
                                            已出
                                        </span>
                                    )}

                                    {/* 上移/下移 */}
                                    <div className="flex gap-px shrink-0">
                                        <button
                                            onClick={() => moveCard(i, -1)}
                                            disabled={i === 0}
                                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-20 text-[10px]"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            onClick={() => moveCard(i, 1)}
                                            disabled={i === deckOrder.length - 1}
                                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-20 text-[10px]"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        前 {windowSize} 张为初始手牌。每次释放 EX 后消耗该卡及左侧所有卡，窗口右移。
                    </p>
                </>
            )}
        </div>
    )
}
