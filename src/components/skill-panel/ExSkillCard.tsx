import { useState, useMemo } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import type { SkillBlock } from '../../types/timeline'
import { SkillAddForm } from './SkillAddForm'
import { useI18n, tpl } from '../../i18n'

interface ExSkillCardProps {
  student: Student
}

export function ExSkillCard({ student }: ExSkillCardProps) {
  const { t } = useI18n()
  const [startFrame, setStartFrame] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const slots = useSquadStore((s) => s.config.slots)

  // 查找该学生对应的 slotIndex
  const slotIndex = useMemo(() => {
    const slot = slots.find((s) => s.student?.Id === student.Id)
    return slot?.index ?? -1
  }, [slots, student.Id])

  const ex = student.Skills.E
  const hasGear = student.HasGear
  const ns = hasGear ? student.Skills.G : student.Skills.P
  const ep = student.Skills.EP

  const exApplyFrame = ex.Effects.find((ef) => ef.ApplyFrame != null)?.ApplyFrame ?? Math.floor(ex.Duration / 2)

  const handleAdd = (type: SkillBlock['type'], name: string) => {
    if (slotIndex < 0) return
    const block: SkillBlock = {
      type,
      name,
      startFrame,
      studentId: student.Id,
    }
    addSkillBlock(slotIndex, block)
  }

  return (
    <div className="bg-gray-700/50 rounded p-2 border border-gray-600">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] shrink-0">
          {student.Name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-200 truncate font-medium">{student.Name}</div>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0"
        >
          {showAll ? t.skill.collapse : t.skill.expand}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] text-gray-500">{t.skill.start_frame}</span>
        <input
          type="number"
          min={0}
          max={5400}
          value={startFrame}
          onChange={(e) => setStartFrame(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 bg-gray-600 text-xs text-white rounded px-1.5 py-1"
          placeholder="0"
        />
        <span className="text-[9px] text-gray-500">{t.skill.frame}</span>
      </div>

      <SkillAddForm
        label="EX"
        skillName={ex.Name}
        cost={ex.Cost[0]}
        duration={ex.Duration}
        applyFrame={exApplyFrame}
        studentId={student.Id}
        onAdd={(name) => handleAdd('ex', name)}
      />

      <SkillAddForm
        label="NS"
        skillName={ns.Name || t.skill.no_skill}
        duration={ns.Duration}
        applyFrame={ns.Effects.find((ef) => ef.ApplyFrame != null)?.ApplyFrame ?? 0}
        studentId={student.Id}
        onAdd={(name) => {
          if (name !== t.skill.no_skill) handleAdd('ns', name)
        }}
      />

      {showAll && (
        <SkillAddForm
          label="SS"
          skillName={ep.Name || t.skill.no_skill}
          duration={0}
          applyFrame={0}
          triggerInfo={t.skill.permanent}
          studentId={student.Id}
          onAdd={() => { }}
        />
      )}
    </div>
  )
}

