import { useState, useMemo } from 'react'
import { useStudentStore } from '../../stores/useStudentStore'
import type { Student, SquadType } from '../../types/student'
import { useI18n, tpl } from '../../i18n'

export interface StudentSearchProps {
  squadType?: SquadType
  excludeIds?: number[]
  onSelect: (student: Student) => void
}

export function StudentSearch({ squadType, excludeIds = [], onSelect }: StudentSearchProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const students = useStudentStore((s) => s.students)
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const results = useMemo(() => {
    if (!students) return []

    const q = query.toLowerCase().trim()
    const all = Object.values(students)

    return all.filter((s) => {
      if (squadType && s.SquadType !== squadType) return false
      if (excludeSet.has(s.Id)) return false
      if (!q) return true
      return (
        s.Name.toLowerCase().includes(q) ||
        s.School.toLowerCase().includes(q) ||
        s.Position.toLowerCase().includes(q) ||
        s.BulletType.toLowerCase().includes(q)
      )
    }).slice(0, 30)
  }, [students, query, squadType, excludeSet])

  const placeholder = squadType
    ? (squadType === 'Main' ? t.squad.search_placeholder_front : t.squad.search_placeholder_back)
    : t.squad.search_placeholder

  return (
    <div className="flex flex-col">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full bg-gray-700 text-sm text-white rounded-lg px-3 py-2 pl-9 border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-400"
        />
        <svg
          className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {query && (
        <p className="text-[11px] text-gray-500 mt-1.5">
          {tpl(t.search.found, { n: results.length })}
        </p>
      )}

      <div className="flex-1 overflow-y-auto mt-2 space-y-0.5">
        {results.map((student) => (
          <button
            key={student.Id}
            onClick={() => onSelect(student)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-[10px] shrink-0">
              {student.Name.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 truncate font-medium">
                {student.Name}
              </div>
              <div className="text-[10px] text-gray-500 truncate">
                {student.School}
                <span className="mx-1">·</span>
                {student.Position}
                <span className="mx-1">·</span>
                {student.BulletType}
                <span className="mx-1">·</span>
                {student.ArmorType}
              </div>
            </div>

            <div className="text-[10px] text-yellow-400 shrink-0">
              {'★'.repeat(student.StarGrade)}
            </div>
          </button>
        ))}

        {results.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-6">{t.squad.no_results}</p>
        )}
      </div>
    </div>
  )
}
