import { useMemo } from 'react'
import type { Student } from '../../types/student'
import type { StudentLane } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { studentBuffStyle } from '../../utils/studentColors'

interface BuffTrackProps {
  lane: StudentLane
  pxPerFrame: number
}

const BAR_HEIGHT = 6
const BAR_GAP = 2
const MIN_TRACK_HEIGHT = 14

function msToFrames(ms: number): number {
  if (ms <= 0) return 0
  return Math.round(ms * 30 / 1000)
}

interface BuffBar {
  startFrame: number
  durationFrames: number
  type: string
  skillType: string
  casterName: string
  casterSlot: number
  stat: string
  /** 是否被覆盖（部分）。渲染时按此取色：false=本色, true=灰色 */
  overridden: boolean
}

/** 获取技能的 Effects 数组 */
function getEffects(skill: { type: string }, stu: Student): typeof stu.Skills.E.Effects {
  if (skill.type === 'ex') return stu.Skills.E.Effects
  if (skill.type === 'ns') {
    const pub = stu.HasGear ? stu.Skills.G : stu.Skills.P
    return pub.Effects
  }
  if (skill.type === 'ss') return stu.Skills.EP.Effects
  return []
}

/** 获取技能的默认 ApplyFrame */
function getDefaultApply(skill: { type: string }, stu: Student): number {
  if (skill.type === 'ex') return Math.floor(stu.Skills.E.Duration / 2)
  if (skill.type === 'ns') {
    const pub = stu.HasGear ? stu.Skills.G : stu.Skills.P
    return Math.floor((pub.Duration || 60) / 2)
  }
  return 0
}

/** 贪心分行：重叠的 Buff 条自动错开，返回每条的 row 索引 */
function computeBuffRows(bars: BuffBar[]): number[] {
  const rows: number[] = []
  const rowEndFrames: number[] = []

  for (const bar of bars) {
    const start = bar.startFrame
    const end = start + bar.durationFrames

    let row = 0
    while (row < rowEndFrames.length && rowEndFrames[row] > start) {
      row++
    }
    rows.push(row)
    rowEndFrames[row] = end
  }

  return rows
}

export function BuffTrack({ lane, pxPerFrame }: BuffTrackProps) {
  const allLanes = useTimelineStore((s) => s.lanes)
  const { student } = lane

  // ── 收集所有轨道中以当前学生为 target 的 Buff/Debuff ──
  const bars = useMemo(() => {
    if (!student) return []

    const result: BuffBar[] = []

    // 遍历所有 lane
    for (const sourceLane of allLanes) {
      if (!sourceLane.student) continue
      const caster = sourceLane.student

      for (const skill of sourceLane.skills) {
        // 仅收集以当前学生为目标的技能
        const target = skill.targetId ?? skill.studentId
        if (target !== student.Id) continue

        const effects = getEffects(skill, caster)
        const defApply = getDefaultApply(skill, caster)

        for (const ef of effects) {
          let durMs = 0
          let eType = ef.Type

          if (ef.Type === 'Buff' && ef.Duration != null && ef.Duration > 0) {
            durMs = ef.Duration
            if (ef.Target?.includes('Enemy')) eType = 'Debuff'
          } else if (ef.Type === 'Shield' && ef.Duration != null && ef.Duration > 0) {
            durMs = ef.Duration
          } else if (ef.Type === 'Regen' && ef.Duration != null && ef.Duration > 0) {
            durMs = ef.Duration
          } else if (ef.Type === 'CrowdControl' && ef.Scale?.length) {
            durMs = ef.Scale[ef.Scale.length - 1]
          } else if (ef.Type === 'DamageDebuff' && ef.Duration != null && ef.Duration > 0) {
            durMs = ef.Duration
          } else if (ef.Type === 'Summon' && ef.Duration != null && ef.Duration > 0) {
            durMs = ef.Duration
          } else {
            continue
          }

          if (durMs > 0) {
            const applyFrame = ef.ApplyFrame ?? defApply
            result.push({
              startFrame: skill.startFrame + applyFrame,
              durationFrames: msToFrames(durMs),
              type: eType,
              skillType: skill.type,
              casterName: caster.Name,
              casterSlot: sourceLane.slotIndex,
              stat: ef.Stat ?? '',
              overridden: false,
            })
          }
        }
      }
    }

    return result
  }, [allLanes, student])

  // ── 覆盖判定：同 Stat + 同 skillType → 后来者覆盖先前者（部分覆盖） ──
  const resolvedBars = useMemo(() => {
    if (bars.length === 0) return []

    // 按 (Stat, skillType) 分组
    const groups = new Map<string, number[]>()
    bars.forEach((bar, i) => {
      const key = `${bar.stat}//${bar.skillType}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(i)
    })

    // 记录每个原始 bar 的覆盖起始帧（同一 bar 可能被多次覆盖，取最早）
    const overrideMap = new Map<number, number>() // barIndex → 被覆盖的起始帧

    for (const indices of groups.values()) {
      const sorted = [...indices].sort((a, b) => bars[a].startFrame - bars[b].startFrame)
      for (let j = 1; j < sorted.length; j++) {
        const iPrev = sorted[j - 1]
        const iCurr = sorted[j]
        const prev = bars[iPrev]
        const curr = bars[iCurr]
        const prevEnd = prev.startFrame + prev.durationFrames
        if (curr.startFrame < prevEnd) {
          const existing = overrideMap.get(iPrev)
          if (existing == null || curr.startFrame < existing) {
            overrideMap.set(iPrev, curr.startFrame)
          }
        }
      }
    }

    // 拆分被覆盖的 bar
    const result: BuffBar[] = []
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]
      const overrideAt = overrideMap.get(i)
      if (overrideAt != null && overrideAt > bar.startFrame) {
        // 拆分：前半正常，后半灰色
        const activeLen = overrideAt - bar.startFrame
        if (activeLen > 0) {
          result.push({ ...bar, durationFrames: activeLen, overridden: false })
        }
        const grayLen = bar.durationFrames - activeLen
        if (grayLen > 0) {
          result.push({ ...bar, startFrame: overrideAt, durationFrames: grayLen, overridden: true })
        }
      } else {
        // 无需拆分
        result.push({ ...bar, overridden: false })
      }
    }

    return result
  }, [bars])

  // ── 计算行号 ──
  const { buffRows, totalRows } = useMemo(() => {
    if (resolvedBars.length === 0) return { buffRows: [], totalRows: 1 }
    const rows = computeBuffRows(resolvedBars)
    return { buffRows: rows, totalRows: Math.max(...rows) + 1 }
  }, [resolvedBars])

  // 动态轨道高度
  const trackHeight = Math.max(MIN_TRACK_HEIGHT, totalRows * (BAR_HEIGHT + BAR_GAP) + BAR_GAP)

  return (
    <div className="flex border-b" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-app)', height: trackHeight }}>
      {/* 左侧标签 */}
      <div className="sticky left-0 z-10 flex items-center px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
        <span className="text-[9px] text-gray-600 uppercase">buffs</span>
      </div>

      {/* 右侧 Bar 区域 */}
      <div className="relative flex-1">
        {resolvedBars.map((bar, idx) => {
          const bg = studentBuffStyle(bar.casterSlot, bar.overridden)
          const row = buffRows[idx] ?? 0
          const top = BAR_GAP + row * (BAR_HEIGHT + BAR_GAP)
          const shortLabel = bar.type === 'CrowdControl' ? 'CC' : bar.type
          return (
            <div
              key={idx}
              className={`absolute border-l group/buff ${bar.overridden ? 'opacity-60' : ''}`}
              style={{
                left: bar.startFrame * pxPerFrame,
                top,
                width: bar.durationFrames * pxPerFrame,
                height: BAR_HEIGHT,
                borderRadius: '0 4px 4px 0',
                ...bg,
              }}
              title={`${bar.type} — ${bar.casterName} (${bar.skillType.toUpperCase()})${bar.overridden ? ' [覆盖]' : ''}${bar.stat ? ' · ' + bar.stat : ''}`}
            >
              {/* 悬停时显示类型标签 */}
              <span className="absolute text-[7px] text-white/60 opacity-0 group-hover/buff:opacity-100 transition-opacity whitespace-nowrap pl-1 -top-2.5 left-0">
                {shortLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
