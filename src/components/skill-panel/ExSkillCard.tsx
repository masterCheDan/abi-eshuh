import { useState, useMemo } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import type { SkillBlock } from '../../types/timeline'
import { SkillAddForm } from './SkillAddForm'
import { useI18n } from '../../i18n'

interface ExSkillCardProps {
  student: Student
}

export function ExSkillCard({ student }: ExSkillCardProps) {
  const { t } = useI18n()
  const [startFrame, setStartFrame] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [targetId, setTargetId] = useState<number | null>(null)
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const slots = useSquadStore((s) => s.config.slots)

  // 查找该学生对应的 slotIndex
  const slotIndex = useMemo(() => {
    const slot = slots.find((s) => s.student?.Id === student.Id)
    return slot?.index ?? -1
  }, [slots, student.Id])

  // 所有已编队学生列表（用于目标选择器）
  const squadStudents = useMemo(
    () => slots.filter((s) => s.student).map((s) => s.student!),
    [slots]
  )

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
      targetId: targetId ?? student.Id,
    }
    addSkillBlock(slotIndex, block)
  }

  return (
    <div className="rounded p-2 border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] shrink-0">
          {student.Name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>{student.Name}</div>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] hover:opacity-75 shrink-0" style={{ color: 'var(--text-muted)' }}
        >
          {showAll ? t.skill.collapse : t.skill.expand}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.skill.start_frame}</span>
        <input
          type="number"
          min={0}
          max={5400}
          value={startFrame}
          onChange={(e) => setStartFrame(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 text-xs rounded px-1.5 py-1 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          placeholder="0"
        />
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.skill.frame}</span>
        {/* 目标选择器 */}
        <span className="text-[9px] ml-2" style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span>
        <select
          value={targetId ?? student.Id}
          onChange={(e) => {
            const v = parseInt(e.target.value)
            setTargetId(v === student.Id ? null : v)
          }}
          className="text-xs rounded px-1 py-0.5 max-w-[90px] truncate border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
        >
          <option value={student.Id}>{t.skill.target_self}</option>
          {squadStudents
            .filter((s) => s.Id !== student.Id)
            .map((s) => (
              <option key={s.Id} value={s.Id}>
                {s.Name}
              </option>
            ))}
        </select>
      </div>

      <SkillAddForm
        label="EX"
        skillName={ex.Name}
        cost={ex.Cost[0]}
        duration={ex.Duration}
        applyFrame={exApplyFrame}
        studentId={student.Id}
        targetId={targetId ?? student.Id}
        icon={ex.Icon}
        bulletType={student.BulletType}
        onAdd={(name) => handleAdd('ex', name)}
      />

      <SkillAddForm
        label="NS"
        skillName={ns.Name || t.skill.no_skill}
        duration={ns.Duration}
        applyFrame={ns.Effects.find((ef) => ef.ApplyFrame != null)?.ApplyFrame ?? 0}
        studentId={student.Id}
        targetId={targetId ?? student.Id}
        icon={ns.Icon}
        bulletType={student.BulletType}
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
          targetId={targetId ?? student.Id}
          icon={ep.Icon}
          bulletType={student.BulletType}
          onAdd={() => { }}
        />
      )}
    </div>
  )
}

