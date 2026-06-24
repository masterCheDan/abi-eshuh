import { useEffect, useRef, useState, useMemo } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useI18n } from '../../i18n'
import { exportNaturalLanguage, encodeShareCode } from '../../utils/planExport'

interface ExportDialogProps {
  onClose: () => void
}

type ExportMode = 'natural' | 'share'

export function ExportDialog({ onClose }: ExportDialogProps) {
  const { t } = useI18n()
  const lanes = useTimelineStore((s) => s.lanes)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ExportMode>('natural')

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const text = useMemo(() => {
    if (mode === 'natural') return exportNaturalLanguage(lanes)
    const result = encodeShareCode(lanes)
    return result.code
  }, [mode, lanes])

  const handleCopy = () => {
    if (text) navigator.clipboard.writeText(text)
  }

  const handleDownload = () => {
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = mode === 'natural' ? 'plan.txt' : 'plan-share.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="rounded-xl border shadow-2xl w-[520px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.timeline.export}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* 模式选择 + 内容 */}
        <div className="flex flex-col flex-1 min-h-0 p-4">
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>{t.timeline.export}:</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ExportMode)}
              className="rounded px-2 py-1 border"
              style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              <option value="natural">{t.timeline.export_natural}</option>
              <option value="share">{t.timeline.export_share}</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={handleCopy}
              className="px-3 py-1 rounded border text-xs"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              {t.timeline.export_copy}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1 rounded border text-xs"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              {t.timeline.export_download}
            </button>
          </div>

          <pre className="flex-1 min-h-0 overflow-y-auto rounded p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
            style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
            {text}
          </pre>
        </div>
      </div>
    </div>
  )
}
