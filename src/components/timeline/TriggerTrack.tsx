/**
 * 触发器轨道 (Sub-T3) — SDD §6.2
 *
 * 标识特定 SS（被动技能/ExtraPassive）的触发帧。
 * 以细小的彩色标记点显示在时间轴底部。
 */

import { useMemo } from 'react'
import type { StudentLane } from '../../types/timeline'

interface TriggerTrackProps {
  lane: StudentLane
  pxPerFrame: number
}

const TRACK_HEIGHT = 8

export function TriggerTrack({ lane, pxPerFrame }: TriggerTrackProps) {
  const { student, skills } = lane

  const triggers = useMemo(() => {
    if (!student) return [] as { frame: number; label: string }[]

    const result: { frame: number; label: string }[] = []
    const ep = student.Skills.EP

    if (ep?.Effects) {
      // SS 触发帧：战术入场时（帧0）+ 条件触发
      for (const ef of ep.Effects) {
        if (ef.Type === 'Buff' || ef.Type === 'Special') {
          result.push({ frame: 0, label: 'SS' })
          break
        }
      }
    }

    // NS 技能也在此标记（已有技能块的 NS 用不同颜色）
    for (const skill of skills) {
      if (skill.type === 'ns') {
        result.push({ frame: skill.startFrame, label: 'NS' })
      } else if (skill.type === 'ss') {
        result.push({ frame: skill.startFrame, label: 'SS' })
      }
    }

    return result
  }, [student, skills])

  if (!student) {
    return <div className="flex border-b border-gray-800/20" style={{ height: TRACK_HEIGHT }} />
  }

  const colors: Record<string, string> = {
    SS: '#f59e0b',
    NS: '#10b981',
  }

  return (
    <div className="flex border-b border-gray-800/20" style={{ height: TRACK_HEIGHT }}>
      <div className="sticky left-0 z-10 shrink-0 w-20 border-r border-gray-800/20" />
      <div className="relative flex-1">
        {triggers.map((t, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{
              left: t.frame * pxPerFrame - 2,
              width: 4,
              height: 4,
              background: colors[t.label] ?? '#888',
              opacity: 0.7,
            }}
            title={`${t.label} @ ${t.frame}帧`}
          />
        ))}
      </div>
    </div>
  )
}
