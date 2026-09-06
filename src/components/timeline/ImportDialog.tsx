import { useEffect, useRef, useState } from 'react'
import { useStudentStore } from '../../stores/useStudentStore'
import { useI18n } from '../../i18n'
import { decodeShareCode } from '../../utils/planExport'
import { importPlanIntoStores } from '../../stores/planTransfer'

interface ImportDialogProps { onClose: () => void }

export function ImportDialog({ onClose }: ImportDialogProps) {
  const { t } = useI18n()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [codeText, setCodeText] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const students = useStudentStore((s) => s.students)

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

  const handleImport = () => {
    setError('')

    if (!students) {
      setError('学生数据尚未加载')
      return
    }

    const result = decodeShareCode(codeText.trim())
    if (!result) {
      setError('无法解析该分享码，请检查是否完整复制')
      return
    }

    const prepared = importPlanIntoStores(result, new Map(Object.values(students).map(student => [student.Id, student])))
    if ('error' in prepared) { setError(prepared.error); return }
    if (prepared.plan.warnings.length) setNotice('导入成功。' + prepared.plan.warnings.join(' '))
    else onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="rounded-xl border shadow-2xl w-[520px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.timeline.import_title}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs text-gray-400"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 p-4">
          <textarea
            value={codeText}
            onChange={(e) => { setCodeText(e.target.value); setError(''); setNotice('') }}
            placeholder={t.timeline.import_placeholder}
            className="flex-1 min-h-[120px] rounded p-3 text-xs font-mono leading-relaxed resize-none border"
            style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          />

          {notice && <div role="status" className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{notice}<button className="ml-2 underline" onClick={onClose}>完成</button></div>}
          {error && (
            <div className="mt-2 text-[11px] text-red-400">{error}</div>
          )}

          <button
            onClick={handleImport}
            disabled={!codeText.trim()}
            className="ba-cut-btn mt-3 px-4 py-1.5 text-xs font-medium"
            style={{
              background: codeText.trim() ? 'var(--accent)' : 'var(--bg-surface-alt)',
              color: codeText.trim() ? '#fff' : 'var(--text-muted)',
            }}
          >
            {t.timeline.import_btn}
          </button>
        </div>
      </div>
    </div>
  )
}
