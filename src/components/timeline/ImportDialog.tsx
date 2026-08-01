import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useStudentStore } from '../../stores/useStudentStore'
import { useI18n } from '../../i18n'
import { decodeShareCode } from '../../utils/planExport'
import type { ImportData } from '../../utils/planExport'
import type { StudentLane } from '../../types/timeline'
import type { SkillRef, TriggerSource, TriggerEvidence } from '../../engine/model/types'

type CompatibleImport = {
  studentIds: number[]
  skills: Array<{ frame: number; casterSlot: number; targetSlot?: number; targetSlots?: number[]; skillRef?: SkillRef; triggerSource?: TriggerSource; trigger?: TriggerEvidence }>
  ranks?: Array<[number, number] | null>
}

function blockType(ref: SkillRef): 'ex' | 'ns' | 'ss' {
  return ref.kind === 'ex' || ref.kind === 'extra_ex' ? 'ex' : ref.kind === 'public' || ref.kind === 'gear_public' ? 'ns' : 'ss'
}

function skillName(student: NonNullable<StudentLane['student']>, ref: SkillRef): string {
  if (ref.kind === 'public') return student.Skills.P?.Name ?? student.Skills.E.Name
  if (ref.kind === 'gear_public') return student.Skills.G?.Name ?? student.Skills.P?.Name ?? student.Skills.E.Name
  if (ref.kind === 'extra_passive') return student.Skills.EP.Name
  if (ref.kind === 'passive') return student.Skills.PS.Name
  if (ref.kind === 'weapon_passive') return student.Skills.WP.Name
  if (ref.kind === 'extra_ex') {
    const extras = student.Skills.E.ExtraSkills ?? []
    return (ref.extraSkillId ? extras.find(s => s.Id === ref.extraSkillId) : extras[ref.extraSkillIndex ?? 0])?.Name ?? student.Skills.E.Name
  }
  return student.Skills.E.Name
}

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

    if (!students) {
      setError('学生数据尚未加载')
      return
    }

    const result = decodeShareCode(codeText.trim())
    if (!result) {
      setError('无法解析该分享码，请检查是否完整复制')
      return
    }

    const data = result.data as ImportData & CompatibleImport
    const { studentIds, skills } = data

    // ── 1. 建立新的 SquadSlot 数组 + TimeLane 数组 ──
    const newLanes: StudentLane[] = []
    const squadSlots: import('../../types/squad').SquadSlot[] = []

    const mainSlotCount = studentIds.length > 6 ? 6 : 4
    for (let i = 0; i < studentIds.length; i++) {
      const sid = studentIds[i]
      const student = sid >= 0 && students[sid] ? students[sid] : null
      const isMain = i < mainSlotCount
      const rank = data.ranks?.[i]

      squadSlots.push({
        index: i,
        slotType: isMain ? 'Main' : 'Support',
        label: isMain ? `STRIKER ${i + 1}` : `SPECIAL ${i - mainSlotCount + 1}`,
        student,
        locked: !!student,
        exLevel: 5,
        nsLevel: 10,
        ssLevel: 10,
        starLevel: student ? rank?.[0] ?? student.StarGrade : 0,
        uniqueWeaponLevel: student ? rank?.[1] ?? 0 : 0,
      })

      newLanes.push({
        slotIndex: i,
        label: isMain ? `STRIKER ${i + 1}` : `SPECIAL ${i - mainSlotCount + 1}`,
        student,
        studentId: student?.Id ?? null,
        skills: [],
      })
    }

    // ── 2. 添加技能事件 ──
    for (const ev of skills) {
      const lane = newLanes[ev.casterSlot]
      if (!lane || !lane.student) continue

      const targetSlots = ev.targetSlots ?? (ev.targetSlot == null ? [] : [ev.targetSlot])
      const targetIds = targetSlots.map(targetSlot => {
        if (targetSlot === -1) return -1
        return newLanes[targetSlot]?.student?.Id ?? -1
      })
      const ref = ev.skillRef ?? { kind: 'ex' } as SkillRef

      lane.skills.push({
        type: blockType(ref),
        name: skillName(lane.student, ref),
        startFrame: ev.frame,
        studentId: lane.student.Id,
        targetId: targetIds[0] ?? lane.student.Id,
        targetIds,
        skillRef: ref,
        triggerSource: ev.triggerSource ?? 'manual',
        trigger: ev.trigger ?? { source: ev.triggerSource ?? 'manual' },
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
