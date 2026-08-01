import { useState, useMemo } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { useI18n, tpl } from '../../i18n'
import { StudentAvatar } from '../student-panel/StudentAvatar'
import { StudentSelectDialog } from '../student-panel/StudentSelectDialog'

interface SquadSlotProps {
  slotIndex: number
}

export function SquadSlotComponent({ slotIndex }: SquadSlotProps) {
  const { t } = useI18n()
  const [showDialog, setShowDialog] = useState(false)
  const slot = useSquadStore((s) => s.config.slots[slotIndex])
  const assignStudent = useSquadStore((s) => s.assignStudent)
  const removeStudent = useSquadStore((s) => s.removeStudent)

  const allSlots = useSquadStore((s) => s.config.slots)
  const assignedIds = useMemo(
    () => allSlots.filter((s) => s.student).map((s) => s.student!.Id),
    [allSlots]
  )
  const dialogTitle = slot.slotType === 'Main'
    ? tpl(t.squad.select_front, { label: slot.label })
    : tpl(t.squad.select_back, { label: slot.label })

  if (slot.student && slot.locked) {
    return (
      <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDialog(true)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setShowDialog(true) }}
        className="relative rounded p-2 border group cursor-pointer hover:brightness-110 transition-all"
        style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}
        title="点击更换学生"
      >
        <div className="flex items-center gap-2">
          <StudentAvatar student={slot.student} size={28} />
          <div className="min-w-0">
            <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{slot.student.Name}</div>
            <div className="text-[10px] truncate font-game" style={{ color: 'var(--text-muted)' }}>
              {slot.student.Position} · {slot.student.BulletType} · {slot.student.ArmorType}
            </div>
            <div className="flex items-center gap-1.5 text-[9px] leading-none mt-1">
              <span style={{ color: '#fbbf24' }}>{'★'.repeat(slot.starLevel)}</span>
              {slot.uniqueWeaponLevel > 0 && (
                <span style={{ color: '#38bdf8' }}>专武{slot.uniqueWeaponLevel}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={(event) => { event.stopPropagation(); removeStudent(slot.index) }}
          className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full items-center justify-center text-[10px] text-white"
        >
          ×
        </button>
      </div>
      {showDialog && (
        <StudentSelectDialog
          title={dialogTitle}
          squadType={slot.slotType}
          excludeIds={assignedIds.filter(id => id !== slot.student?.Id)}
          onSelect={(student) => assignStudent(slot.index, student)}
          onClose={() => setShowDialog(false)}
        />
      )}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="w-full border border-dashed rounded p-2 text-xs transition-colors text-left" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        {slot.label}
      </button>

      {showDialog && (
        <StudentSelectDialog
          title={dialogTitle}
          squadType={slot.slotType}
          excludeIds={assignedIds}
          onSelect={(student) => assignStudent(slot.index, student)}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  )
}
