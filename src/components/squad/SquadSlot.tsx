import { useState, useMemo } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { useI18n, tpl } from '../../i18n'
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

  if (slot.student && slot.locked) {
    return (
      <div className="relative bg-gray-700 rounded p-2 border border-gray-600 group">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] shrink-0">
            {slot.student.Name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-200 truncate">{slot.student.Name}</div>
            <div className="text-[9px] text-gray-500 truncate">
              {slot.student.Position} · {slot.student.BulletType}
            </div>
          </div>
        </div>
        <button
          onClick={() => removeStudent(slot.index)}
          className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full items-center justify-center text-[10px] text-white"
        >
          ×
        </button>
      </div>
    )
  }

  const dialogTitle = slot.slotType === 'Main'
    ? tpl(t.squad.select_front, { label: slot.label })
    : tpl(t.squad.select_back, { label: slot.label })

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="w-full bg-gray-700/50 border border-dashed border-gray-600 rounded p-2 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-300 transition-colors text-left"
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
