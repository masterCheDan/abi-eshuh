import { useState, useMemo } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { StudentSkillCard } from './StudentSkillCard'
import { useI18n } from '../../i18n'

export function SkillPanel() {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const slots = useSquadStore((s) => s.config.slots)

  const assignedStudents = useMemo(
    () => slots.filter((s) => s.student).map((s) => s.student!),
    [slots]
  )

  return (
    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <h2 className="text-sm font-semibold text-gray-200">{t.skill.title}</h2>
      </div>

      {!collapsed && (assignedStudents.length === 0
        ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            {t.skill.empty}
          </p>
        : <div className="space-y-2">
            {assignedStudents.map((student) => (
              <StudentSkillCard key={student.Id} student={student} />
            ))}
          </div>
      )}
    </div>
  )
}
