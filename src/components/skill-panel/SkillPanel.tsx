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
    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold text-gray-200 mb-2">{t.skill.title}</h2>

      {assignedStudents.length === 0 ? (
        <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
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
