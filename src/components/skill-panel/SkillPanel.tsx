import { useMemo } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { ExSkillCard } from './ExSkillCard'
import { useI18n } from '../../i18n'

export function SkillPanel() {
  const { t } = useI18n()
  const slots = useSquadStore((s) => s.config.slots)

  const assignedStudents = useMemo(
    () => slots.filter((s) => s.student).map((s) => s.student!),
    [slots]
  )

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <h2 className="text-sm font-semibold text-gray-200 mb-2">{t.skill.title}</h2>

      {assignedStudents.length === 0 ? (
        <p className="text-[11px] text-gray-500 text-center py-4">
          {t.skill.empty}
        </p>
      ) : (
        <div className="space-y-2">
          {assignedStudents.map((student) => (
            <ExSkillCard key={student.Id} student={student} />
          ))}
        </div>
      )}
    </div>
  )
}
