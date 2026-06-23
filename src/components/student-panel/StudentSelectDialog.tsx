import { useEffect, useRef } from 'react'
import type { Student, SquadType } from '../../types/student'
import { StudentSearch } from './StudentSearch'

interface StudentSelectDialogProps {
  title: string
  squadType?: SquadType
  excludeIds?: number[]
  onSelect: (student: Student) => void
  onClose: () => void
}

export function StudentSelectDialog({
  title,
  squadType,
  excludeIds,
  onSelect,
  onClose,
}: StudentSelectDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-[420px] max-h-[600px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs text-gray-400"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <StudentSearch
            squadType={squadType}
            excludeIds={excludeIds}
            onSelect={(student) => {
              onSelect(student)
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
