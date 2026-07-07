/**
 * 模拟错误面板 — SDD §6.3 容错反馈
 *
 * 类似 IDE 底部问题面板 (Problems Panel)：
 * - 可折叠，标题显示错误/警告计数
 * - 每行：帧号 | 错误类型 | 描述
 * - 点击行 → 播放头跳转至对应帧 + 水平滚动到可见
 */

import { useState, useMemo } from 'react'
import type { SimulationError } from '../../engine/model/types'
import { useI18n, tpl } from '../../i18n'

interface SimulationErrorPanelProps {
    errors: SimulationError[]
    pxPerFrame: number
    scrollRef: React.RefObject<HTMLDivElement | null>
    onJumpToFrame: (frame: number) => void
}

const ERROR_TYPE_COLORS: Record<string, string> = {
    COST_EXCEEDED: '#f87171',
    OUT_OF_WINDOW: '#fbbf24',
    COOLDOWN: '#f97316',
    INVALID_TARGET: '#a78bfa',
}

function frameToTime(totalFrames: number): string {
    const f = totalFrames % 30
    const totalSeconds = Math.floor(totalFrames / 30)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
}

export function SimulationErrorPanel({
    errors,
    pxPerFrame,
    scrollRef,
    onJumpToFrame,
}: SimulationErrorPanelProps) {
    const { t } = useI18n()
    const [collapsed, setCollapsed] = useState(false)

    const grouped = useMemo(() => {
        const cost = errors.filter(e => e.type === 'COST_EXCEEDED')
        const window = errors.filter(e => e.type === 'OUT_OF_WINDOW')
        const other = errors.filter(e => !['COST_EXCEEDED', 'OUT_OF_WINDOW'].includes(e.type))
        return { cost, window, other }
    }, [errors])

    if (errors.length === 0) return null

    const handleJump = (frame: number) => {
        onJumpToFrame(frame)
        setTimeout(() => {
            const el = scrollRef.current
            if (!el) return
            const targetX = frame * pxPerFrame - 200
            el.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' })
        }, 50)
    }

    return (
        <div
            className="shrink-0 border-t"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
            {/* 折叠标题栏 */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center gap-2 px-3 py-1 text-left hover:brightness-110 transition-all"
            >
                <svg
                    className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                    style={{ color: 'var(--text-muted)' }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.sim_error.panel_title}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                    {errors.length} {errors.length === 1 ? 'error' : 'errors'}
                </span>
                {grouped.cost.length > 0 && (
                    <span className="text-[10px]" style={{ color: '#f87171' }}>
                        {grouped.cost.length} COST
                    </span>
                )}
                {grouped.window.length > 0 && (
                    <span className="text-[10px]" style={{ color: '#fbbf24' }}>
                        {grouped.window.length} {t.sim_error.out_of_window}
                    </span>
                )}
            </button>

            {/* 错误列表 */}
            {!collapsed && (
                <div className="overflow-y-auto" style={{ maxHeight: 100 }}>
                    {errors.map((err, i) => {
                        const color = ERROR_TYPE_COLORS[err.type] ?? '#f87171'
                        const label =
                            err.type === 'COST_EXCEEDED' ? t.sim_error.cost_exceeded :
                                err.type === 'OUT_OF_WINDOW' ? t.sim_error.out_of_window :
                                    err.message
                        const desc =
                            err.type === 'COST_EXCEEDED'
                                ? tpl(t.sim_error.cost_exceeded_msg, { frame: String(err.frame) })
                                : err.type === 'OUT_OF_WINDOW'
                                    ? tpl(t.sim_error.out_of_window_msg, { frame: String(err.frame) })
                                    : err.message
                        return (
                            <button
                                key={i}
                                onClick={() => handleJump(err.frame)}
                                className="w-full flex items-center gap-2 px-3 py-0.5 text-left hover:brightness-125 transition-all border-b last:border-b-0"
                                style={{
                                    background: 'var(--bg-surface-alt)',
                                    borderColor: 'var(--border)',
                                }}
                                title={`${frameToTime(err.frame)} — ${label}`}
                            >
                                <svg className="w-3 h-3 shrink-0" style={{ color }} fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[10px] font-mono shrink-0 w-14" style={{ color }}>
                                    {frameToTime(err.frame)}
                                </span>
                                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                                    F{err.frame}
                                </span>
                                <span
                                    className="text-[9px] px-1 py-px rounded shrink-0 font-medium"
                                    style={{ background: color + '18', color }}
                                >
                                    {label}
                                </span>
                                <span className="text-[10px] truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                                    {desc}
                                </span>
                                {err.issuerId > 0 && (
                                    <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                                        ID:{err.issuerId}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
