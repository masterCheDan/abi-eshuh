import { useMemo } from 'react'
import type { StudentLane } from '../../types/timeline'
import { simulateBattle } from '../../utils/battleSimulator'
import { getStudentHue } from '../../utils/studentColors'

interface AttackTrackProps {
  lane: StudentLane
  pxPerFrame: number
}

const TRACK_HEIGHT = 12

export function AttackTrack({ lane, pxPerFrame }: AttackTrackProps) {
  const { student } = lane

  const segments = useMemo(() => {
    if (!student || student.SquadType !== 'Main') return []
    const result = simulateBattle([lane])
    return result.segments.get(lane.slotIndex) ?? []
  }, [student, lane])

  if (!student || segments.length === 0) {
    return <div className="flex border-b border-gray-800/30" style={{ height: TRACK_HEIGHT }} />
  }

  const hue = getStudentHue(lane.slotIndex)

  const isSkill = (t: string) => t === 'ex' || t === 'ns' || t === 'ss'

  return (
    <div className="flex border-b border-gray-800/30" style={{ height: TRACK_HEIGHT }}>
      <div className="sticky left-0 z-10 shrink-0 w-36 border-r border-gray-800/30" />
      <div className="relative flex-1">
        {/* 底层：攻击循环段（细条） */}
        {segments.map((seg, i) => {
          const type = seg.type as string
          if (isSkill(type)) return null
          const w = (seg.endFrame - seg.startFrame) * pxPerFrame
          if (w < 0.5) return null
          const colors: Record<string, { bg: string; border: string; cls?: string }> = {
            prepare: { bg: `hsla(${hue}, 30%, 50%, 0.12)`, border: `hsla(${hue}, 30%, 50%, 0.2)` },
            reload: { bg: `hsla(${hue}, 20%, 40%, 0.15)`, border: `hsla(${hue}, 20%, 40%, 0.25)` },
            interrupted: { bg: 'hsla(0, 0%, 40%, 0.18)', border: 'hsla(0, 0%, 40%, 0.3)', cls: 'opacity-60' },
            attack: { bg: `hsla(${hue}, 40%, 55%, 0.18)`, border: `hsla(${hue}, 40%, 55%, 0.3)` },
            phase_transition: { bg: 'hsla(10, 70%, 45%, 0.2)', border: 'hsla(10, 70%, 45%, 0.35)' },
          }
          const c = (colors as Record<string, { bg: string; border: string; cls?: string }>)[type] || colors.attack
          const titles: Record<string, string> = {
            prepare: '准备', reload: '换弹', interrupted: 'EX打断',
            phase_transition: '阶段转换', attack: `射击 #${seg.index + 1}`,
          }
          return (
            <div
              key={i}
              className={`absolute border-l ${c.cls ?? ''}`}
              style={{
                left: seg.startFrame * pxPerFrame,
                top: 5,
                width: w,
                height: 3,
                backgroundColor: c.bg,
                borderLeftColor: c.border,
                borderRadius: '0 1px 1px 0',
              }}
              title={titles[type] || type}
            />
          )
        })}
        {/* 上层：技能段（高亮色块 + 标签） */}
        {segments.map((seg, i) => {
          const type = seg.type as string
          if (!isSkill(type)) return null
          const w = (seg.endFrame - seg.startFrame) * pxPerFrame
          if (w < 2) return null
          const skillColors: Record<string, { bg: string; border: string; label: string }> = {
            ex: { bg: 'hsla(45, 80%, 55%, 0.35)', border: 'hsla(45, 80%, 55%, 0.6)', label: 'EX' },
            ns: { bg: 'hsla(200, 60%, 55%, 0.30)', border: 'hsla(200, 60%, 55%, 0.55)', label: 'NS' },
            ss: { bg: 'hsla(280, 55%, 55%, 0.30)', border: 'hsla(280, 55%, 55%, 0.55)', label: 'SS' },
          }
          const c = skillColors[type] || skillColors.ns
          return (
            <div
              key={`skill-${i}`}
              className="absolute flex items-center border-l overflow-hidden"
              style={{
                left: seg.startFrame * pxPerFrame,
                top: 1,
                width: Math.max(w, 14),
                height: TRACK_HEIGHT - 2,
                backgroundColor: c.bg,
                borderLeftColor: c.border,
                borderRadius: '2px',
              }}
              title={`${c.label} 技能`}
            >
              <span
                className="text-[8px] font-bold tracking-wide leading-none ml-0.5"
                style={{ color: c.border }}
              >
                {c.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
