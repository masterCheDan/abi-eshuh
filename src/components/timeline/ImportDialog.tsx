import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useStudentStore } from '../../stores/useStudentStore'
import { useI18n } from '../../i18n'
import { decodeShareCode } from '../../utils/planExport'
import type { ImportData } from '../../utils/planExport'
import type { StudentLane } from '../../types/timeline'

interface ImportDialogProps { onClose: () => void }

export function ImportDialog({ onClose }: ImportDialogProps) {
  const { t } = useI18n()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [codeText, setCodeText] = useState('')
  const [error, setError] = useState('')
  const replaceAllLanes = useTimelineStore((s) => s.replaceAllLanes)
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

    const result = decodeShareCode(codeText.trim())
    if (!result) {
      setError('无法解析该分享码，请检查是否完整复制')
      return
    }

    const data: ImportData = result.data
    const { studentIds, skills } = data

    // ── 1. 建立新的 SquadSlot 数组 + TimeLane 数组 ──
    const newLanes: StudentLane[] = []
    const squadSlots: import('../../types/squad').SquadSlot[] = []

    for (let i = 0; i < studentIds.length; i++) {
      const sid = studentIds[i]
      const student = sid >= 0 && students[sid] ? students[sid] : null
      const isMain = i < 4

      squadSlots.push({
        index: i,
        slotType: isMain ? 'Main' : 'Support',
        label: isMain ? `STRIKER ${i + 1}` : `SPECIAL ${i - 3}`,
        student,
        locked: !!student,
      })

      newLanes.push({
        slotIndex: i,
        label: isMain ? `STRIKER ${i + 1}` : `SPECIAL ${i - 3}`,
        student,
        studentId: student?.Id ?? null,
        skills: [],
      })
    }

    // ── 2. 添加技能事件 ──
    for (const ev of skills) {
      const lane = newLanes[ev.casterSlot]
      if (!lane || !lane.student) continue

      let targetId = -1
      if (ev.targetSlot >= 0 && ev.targetSlot < newLanes.length) {
        const targetLane = newLanes[ev.targetSlot]
        if (targetLane?.student) targetId = targetLane.student.Id
      }

      lane.skills.push({
        type: 'ex',
        name: lane.student.Skills.E.Name,
        startFrame: ev.frame,
        studentId: lane.student.Id,
        targetId: ev.targetSlot >= 0 ? targetId : -1,
      })
    }

    // ── 3. 替换 SquadStore + TimelineStore ──
    useSquadStore.getState().replaceAllSlots(squadSlots)
    replaceAllLanes(newLanes)
    onClose()
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
            onChange={(e) => { setCodeText(e.target.value); setError('') }}
            placeholder={t.timeline.import_placeholder}
            className="flex-1 min-h-[120px] rounded p-3 text-xs font-mono leading-relaxed resize-none border"
            style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          />

          {error && (
            <div className="mt-2 text-[11px] text-red-400">{error}</div>
          )}

          <button
            onClick={handleImport}
            disabled={!codeText.trim()}
            className="mt-3 px-4 py-1.5 rounded text-xs font-medium"
            style={{
              background: codeText.trim() ? '#2563eb' : 'var(--bg-surface-alt)',
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
