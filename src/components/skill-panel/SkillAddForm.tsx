import type { DragEvent } from 'react'
import type { SkillBlock } from '../../types/timeline'
import { useI18n, tpl } from '../../i18n'

interface SkillAddFormProps {
  label: string
  skillName: string
  cost?: number
  duration: number
  applyFrame: number
  studentId?: number
  triggerInfo?: string
  onAdd: (name: string, duration: number, applyFrame: number) => void
}

const TYPE_COLORS: Record<string, string> = {
  ex: 'border-l-blue-500 bg-blue-500/5',
  ns: 'border-l-emerald-500 bg-emerald-500/5',
  ss: 'border-l-amber-500 bg-amber-500/5',
}

export const DRAG_SKILL_KEY = 'application/x-skill-block'

export function SkillAddForm({ label, skillName, cost, duration, applyFrame, studentId, triggerInfo, onAdd }: SkillAddFormProps) {
  const { t } = useI18n()
  const colorClass = TYPE_COLORS[label.toLowerCase()] || 'border-l-gray-500'
  const isDraggable = skillName !== t.skill.no_skill && (label === 'EX' || label === 'NS')

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    const data: SkillBlock = {
      type: label.toLowerCase() as SkillBlock['type'],
      name: skillName,
      startFrame: 0,
      applyFrame,
      duration,
      studentId,
    }
    e.dataTransfer.setData(DRAG_SKILL_KEY, JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      className={`text-xs border-l-2 ${colorClass} pl-2 py-1 mb-1 last:mb-0 ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:bg-white/5' : ''
        }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-gray-300 uppercase shrink-0">{label}</span>
          <span className="text-gray-400 truncate">{skillName === t.skill.no_skill ? t.skill.no_skill : skillName}</span>
        </div>

        {isDraggable && (
          <button
            onClick={() => onAdd(skillName, duration, applyFrame)}
            className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0 ml-1"
          >
            {t.skill.add}
          </button>
        )}
      </div>

      <div className="flex gap-2 text-[9px] text-gray-500">
        {cost !== undefined && <span>{tpl(t.skill.cost, { cost })}</span>}
        {duration > 0 && <span>{tpl(t.skill.anim_frames, { n: duration })}</span>}
        {applyFrame > 0 && <span>{tpl(t.skill.apply_frames, { n: applyFrame })}</span>}
        {triggerInfo && <span>{triggerInfo}</span>}
      </div>
    </div>
  )
}
