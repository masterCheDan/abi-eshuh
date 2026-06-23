import type { DragEvent } from 'react'
import type { StudentLane, SkillBlock } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { DRAG_SKILL_KEY } from '../skill-panel/SkillAddForm'
import { useI18n } from '../../i18n'

interface TimelineLaneProps {
  lane: StudentLane
  pxPerFrame: number
}

const LANE_HEIGHT = 56

export function TimelineLane({ lane, pxPerFrame }: TimelineLaneProps) {
  const { t } = useI18n()
  const { student, skills } = lane
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_SKILL_KEY)
    if (!raw) return

    const dragged: SkillBlock = JSON.parse(raw)
    if (dragged.studentId !== student.Id) return

    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left + e.currentTarget.scrollLeft
    const frame = Math.max(0, Math.round(offsetX / pxPerFrame))

    addSkillBlock(student.Id, { ...dragged, startFrame: frame })
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  return (
    <div
      className="flex border-b border-gray-800 last:border-b-0"
      style={{ height: LANE_HEIGHT }}
    >
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-gray-900 border-r border-gray-700 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 shrink-0">
          {student.Name.charAt(0)}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-200 leading-tight">
            {student.Name}
          </div>
          <div className="text-[10px] text-gray-500 leading-tight">
            {student.School}
          </div>
        </div>
      </div>

      <div
        className="relative flex-1"
        style={{ minHeight: LANE_HEIGHT }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <GridLines pxPerFrame={pxPerFrame} />

        {skills.map((skill, i) => {
          const x = skill.startFrame * pxPerFrame
          const totalW = skill.duration * pxPerFrame
          const applyW = skill.applyFrame * pxPerFrame

          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 flex"
              style={{ left: x, height: 20 }}
            >
              <div
                className="bg-blue-500/30 border-l border-blue-400"
                style={{ width: applyW, height: '100%' }}
              />
              <div
                className="bg-blue-600/60"
                style={{ width: totalW - applyW, height: '100%' }}
              />
              <span
                className="absolute text-[10px] text-white/70 whitespace-nowrap pl-1"
                style={{ left: 2, top: -14 }}
              >
                {skill.name}
              </span>
            </div>
          )
        })}

        {skills.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-gray-600">{t.timeline.empty_hint}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GridLines({ pxPerFrame }: { pxPerFrame: number }) {
  const lines: number[] = []
  for (let f = 0; f <= 5400; f += 30) lines.push(f)
  return (
    <>
      {lines.map((frame) => (
        <div
          key={frame}
          className="absolute top-0 w-px bg-gray-800/50"
          style={{ left: frame * pxPerFrame, height: '100%' }}
        />
      ))}
    </>
  )
}
