/**
 * 右键菜单 — 人工校准偏移输入
 *
 * SDD §6.3: 右键呼出菜单精确输入延迟帧数。
 */

import { useEffect, useRef, useState } from 'react'

interface CalibrationMenuProps {
  /** 屏幕坐标 X */
  x: number
  /** 屏幕坐标 Y */
  y: number
  /** 当前偏移量 */
  currentOffset: number
  /** 确认回调 */
  onApply: (offset: number) => void
  /** 关闭 */
  onClose: () => void
}

export function CalibrationMenu({ x, y, currentOffset, onApply, onClose }: CalibrationMenuProps) {
  const [value, setValue] = useState(String(currentOffset))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleApply = () => {
    const n = parseInt(value) || 0
    onApply(n)
    onClose()
  }

  return (
    <div
      className="fixed z-[100]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-lg border shadow-xl p-3 min-w-[180px]"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)' }}>
          人工校准偏移（帧）
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApply() }}
            className="w-20 text-center rounded px-1.5 py-0.5 border text-xs"
            style={{
              background: 'var(--bg-surface-alt)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border)',
            }}
          />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>帧</span>
          <button
            onClick={handleApply}
            className="text-[10px] px-2 py-0.5 rounded font-medium bg-purple-600/80 hover:bg-purple-500 text-white"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
