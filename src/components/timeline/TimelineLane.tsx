import { useState, useCallback, useMemo } from 'react'
import type { DragEvent } from 'react'
import type { StudentLane, SkillBlock } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { DRAG_SKILL_KEY } from '../skill-panel/SkillAddForm'
import { studentSkillStyles } from '../../utils/studentColors'
import { useI18n } from '../../i18n'

/** 用于内部拖拽移动的 dataTransfer 键名 */
const DRAG_MOVE_KEY = 'tl-skill-move'

interface TimelineLaneProps {
  lane: StudentLane
  pxPerFrame: number
}

const LANE_HEIGHT = 48

/** 技能类型 → 透明度倍率（EX=1, NS=0.75, SS=0.55） */
const TYPE_OPACITY: Record<SkillBlock['type'], number> = {
  ex: 1,
  ns: 0.75,
  ss: 0.55,
}

/** 从 SkillBlock + Student 提取 Effects 数组 */
function getEffects(skill: SkillBlock, student: NonNullable<StudentLane['student']>) {
  if (skill.type === 'ex') return student.Skills.E.Effects
  if (skill.type === 'ns') {
    const pub = student.HasGear ? student.Skills.G : student.Skills.P
    return pub.Effects
  }
  return student.Skills.EP.Effects
}

/** 判断技能是否含伤害效果 */
function isDamageSkill(skill: SkillBlock, student: NonNullable<StudentLane['student']>): boolean {
  return getEffects(skill, student).some((ef) => ef.Type === 'Damage')
}

const BLOCK_HEIGHT = 16
const AFTER_EFFECT_MAX_FRAMES = 600 // 后效最长显示 20 秒

/** 技能时间区间 */
interface SkillRange { start: number; end: number }

/** 找到第一个不重叠的帧 —— 反复推进直到没有冲突 */
function snapToNonOverlap(
  ranges: SkillRange[],
  proposedFrame: number,
  footprint: number,
): number {
  let frame = proposedFrame
  let changed = true
  while (changed) {
    changed = false
    for (const r of ranges) {
      // 区间重叠判定：[frame, frame+footprint) 与 [r.start, r.end) 有交集
      if (frame < r.end && frame + footprint > r.start) {
        frame = r.end
        changed = true
      }
    }
  }
  return frame
}

/** 技能块三段数据 */
interface SkillSegments {
  /** 前摇帧数（动画开始 → 首个效果生效） */
  preCast: number
  /** 生效帧数（首个效果生效 → 动画结束） */
  active: number
  /** 后效帧数（从效果生效起算的总持续时间，0 表示无后效） */
  afterEffect: number
}

/**
 * 将毫秒转换为帧（30fps）
 */
function msToFrames(ms: number): number {
  if (ms <= 0) return 0
  return Math.round(ms * 30 / 1000)
}

/** 从 SkillBlock + Student 推导三段式展示参数 */
function getSkillSegments(skill: SkillBlock, student: NonNullable<StudentLane['student']>): SkillSegments {
  let animDuration = 60

  if (skill.type === 'ex') {
    animDuration = student.Skills.E.Duration
  } else if (skill.type === 'ns') {
    const pub = student.HasGear ? student.Skills.G : student.Skills.P
    animDuration = pub.Duration || 60
  }

  const effects = getEffects(skill, student)

  // ── 前摇：取最早生效帧 ──
  const applyFrames = effects
    .map((ef) => ef.ApplyFrame)
    .filter((f): f is number => f != null)
  const preCast = applyFrames.length > 0
    ? Math.min(...applyFrames)
    : Math.floor(animDuration / 2)

  // ── 生效 = 动画剩余帧 ──
  const active = Math.max(0, animDuration - preCast)

  // ── 后效：从 ApplyFrame 起算，取所有持续效果的最大帧数 ──
  let maxPersistFrames = 0
  for (const ef of effects) {
    let persistMs = 0

    if (ef.Duration != null && ef.Duration > 0) {
      // Regen / Shield / Summon / DamageDebuff / Buff
      persistMs = ef.Duration
    } else if (ef.Type === 'CrowdControl' && ef.Scale && ef.Scale.length > 0) {
      // CrowdControl 持续时间在 Scale 末位
      persistMs = ef.Scale[ef.Scale.length - 1]
    } else if (ef.Type === 'Special' && ef.Channel != null && ef.Channel > 0) {
      persistMs = ef.Channel
    }

    if (persistMs > 0) {
      const persistFrames = msToFrames(persistMs)
      if (persistFrames > maxPersistFrames) {
        maxPersistFrames = persistFrames
      }
    }
  }

  // 后效从 ApplyFrame 开始，持续 maxPersistFrames 帧
  const afterEffect = Math.min(maxPersistFrames, AFTER_EFFECT_MAX_FRAMES)

  return { preCast, active, afterEffect }
}

/** 计算技能块的行号（总宽度 = preCast + max(active, afterEffect)） */
function computeSkillRows(
  skills: SkillBlock[],
  getSegs: (skill: SkillBlock) => SkillSegments
): number[] {
  const rows: number[] = []
  const rowEndFrames: number[] = []

  for (const skill of skills) {
    const start = skill.startFrame
    const segs = getSegs(skill)
    const end = start + segs.preCast + Math.max(segs.active, segs.afterEffect)

    let row = 0
    while (row < rowEndFrames.length && rowEndFrames[row] > start) {
      row++
    }
    rows.push(row)
    rowEndFrames[row] = end
  }

  return rows
}

export function TimelineLane({ lane, pxPerFrame }: TimelineLaneProps) {
  const { t } = useI18n()
  const { label, student, studentId, skills, slotIndex } = lane
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const moveSkillBlock = useTimelineStore((s) => s.moveSkillBlock)
  const removeSkillBlock = useTimelineStore((s) => s.removeSkillBlock)
  const allLanes = useTimelineStore((s) => s.lanes)
  const [dragOverFrame, setDragOverFrame] = useState<number | null>(null)

  const frameFromEvent = useCallback((e: DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left + e.currentTarget.scrollLeft
    return Math.max(0, Math.round(offsetX / pxPerFrame))
  }, [pxPerFrame])

  // 计算技能行（重叠时自动错开，含后效段）
  const skillRows = useMemo(() => {
    if (!student) return []
    return computeSkillRows(skills, (skill) => getSkillSegments(skill, student))
  }, [skills, student])

  // 计算需要的总行数（决定垂直分散范围）
  const totalRows = useMemo(() => {
    if (skillRows.length === 0) return 1
    return Math.max(...skillRows) + 1
  }, [skillRows])

  // 规则2：全局其他轨道 EX 起始帧集合
  const globalExFrames = useMemo(() => {
    const set = new Set<number>()
    for (const l of allLanes) {
      if (l.slotIndex === slotIndex) continue
      for (const s of l.skills) {
        if (s.type === 'ex') set.add(s.startFrame)
      }
    }
    return set
  }, [allLanes, slotIndex])

  // ── 从技能面板拖入 / 内部移动 ──
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverFrame(null)

    // 计算技能足迹（仅动画帧，不含后效）
    const getFootprint = (s: SkillBlock) => {
      const segs = getSkillSegments(s, student!)
      return segs.preCast + segs.active
    }

    // 构建当前轨道已有技能区间
    const buildRanges = (excludeIndex?: number): SkillRange[] =>
      skills
        .map((s, i) => {
          if (i === excludeIndex) return null
          return { start: s.startFrame, end: s.startFrame + getFootprint(s) }
        })
        .filter((r): r is SkillRange => r !== null)

    // ── 内部拖拽移动 ──
    const moveData = e.dataTransfer.getData(DRAG_MOVE_KEY)
    if (moveData) {
      const { skillIndex, fromSlotIndex } = JSON.parse(moveData)
      const moved = skills[skillIndex]
      const ranges = buildRanges(skillIndex)
      const footprint = getFootprint(moved)
      let frame = snapToNonOverlap(ranges, frameFromEvent(e), footprint)

      if (moved.type === 'ex') {
        while (globalExFrames.has(frame)) frame++
      }

      moveSkillBlock(fromSlotIndex, skillIndex, slotIndex, frame)
      return
    }

    // ── 从技能面板拖入新技能 ──
    const raw = e.dataTransfer.getData(DRAG_SKILL_KEY)
    if (!raw) return

    const dragged: SkillBlock = JSON.parse(raw)
    if (dragged.studentId !== studentId) return

    const proposedFrame = frameFromEvent(e)
    const footprint = getFootprint(dragged)

    if (dragged.type === 'ex') {
      // ═══ EX 技能：优先级最高 ═══

      // 规则1a：与同学生已有 EX 冲突 → 自身后移
      const exRanges = skills
        .filter((s) => s.type === 'ex')
        .map((s) => ({ start: s.startFrame, end: s.startFrame + getFootprint(s) }))
      let finalFrame = snapToNonOverlap(exRanges, proposedFrame, footprint)

      // 规则2：一帧内最多一个 EX（跨轨道），逐帧后移
      while (globalExFrames.has(finalFrame)) finalFrame++

      // 规则1b：NS/SS 被 EX 挤出 → 推到 EX 之后（同学生）
      const pushedNS = skills
        .map((s, i) => ({ skill: s, index: i }))
        .filter(({ skill }) => skill.type !== 'ex')
        .filter(({ skill }) => {
          const end = skill.startFrame + getFootprint(skill)
          return skill.startFrame < finalFrame + footprint && end > finalFrame
        })
        .sort((a, b) => b.index - a.index)

      let cursor = finalFrame + footprint
      for (const { index } of pushedNS) {
        moveSkillBlock(slotIndex, index, slotIndex, cursor)
        cursor += getFootprint(skills[index])
      }

      addSkillBlock(lane.slotIndex, { ...dragged, startFrame: finalFrame })
    } else {
      // ═══ NS/SS 技能：避让同学生所有已有技能（EX 不受影响） ═══
      const ranges = buildRanges()
      let frame = snapToNonOverlap(ranges, proposedFrame, footprint)

      // 确保不打扰同学生已有的 EX
      const exRangesAll = skills
        .filter((s) => s.type === 'ex')
        .map((s) => ({ start: s.startFrame, end: s.startFrame + getFootprint(s) }))
      frame = snapToNonOverlap(exRangesAll, frame, footprint)

      addSkillBlock(lane.slotIndex, { ...dragged, startFrame: frame })
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFrame(frameFromEvent(e))
  }

  const handleDragLeave = () => setDragOverFrame(null)

  // ── 技能块拖拽开始 ──
  const handleSkillDragStart = (e: DragEvent<HTMLDivElement>, skillIndex: number) => {
    e.dataTransfer.setData(DRAG_MOVE_KEY, JSON.stringify({ skillIndex, fromSlotIndex: slotIndex }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="flex border-b last:border-b-0"
      style={{ height: LANE_HEIGHT, borderColor: 'var(--border-light)' }}
    >
      {/* 左侧固定标签 */}
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] shrink-0 ${student ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
            }`}
        >
          {student ? student.Name.charAt(0) : '?'}
        </div>
        <div className="min-w-0">
          <div className="text-xs leading-tight">
            {student ? (
              <span className={`font-game text-xs ${label.startsWith('STRIKER') ? 'text-red-500' : 'text-blue-400'}`}>
                {label}
              </span>
            ) : (
              <span className="font-game text-[11px] text-gray-600">{label}</span>
            )}
          </div>
          {student && (
            <div className="text-[9px] text-gray-500 leading-tight truncate">
              {student.Name}
            </div>
          )}
        </div>
      </div>

      {/* 右侧时间轴区域 */}
      <div
        className="relative flex-1"
        style={{ minHeight: LANE_HEIGHT }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <GridLines pxPerFrame={pxPerFrame} />

        {student && skills.map((skill, i) => {
          const x = skill.startFrame * pxPerFrame

          const segs = getSkillSegments(skill, student)
          const preW = segs.preCast * pxPerFrame
          const activeW = segs.active * pxPerFrame
          const op = TYPE_OPACITY[skill.type]
          const damage = isDamageSkill(skill, student)
          const st = studentSkillStyles(slotIndex, op, damage)
          const row = skillRows[i] ?? 0

          const topOffset = totalRows <= 1
            ? '50%'
            : `${((row + 0.5) / totalRows) * 100}%`

          return (
            <div key={i}>
              <div
                draggable
                onDragStart={(e) => handleSkillDragStart(e, i)}
                onDragOver={(e) => { e.stopPropagation(); e.preventDefault() }}
                className="absolute flex items-center cursor-grab active:cursor-grabbing z-20 group"
                style={{
                  left: x,
                  top: topOffset,
                  transform: 'translateY(-50%)',
                  height: BLOCK_HEIGHT,
                }}
              >
                {/* 前摇段 */}
                <div
                  style={{ ...st.preStyle, width: preW, height: '100%', flexShrink: 0 }}
                />
                {/* 生效段 */}
                <div
                  style={{ ...st.activeStyle, width: activeW, height: '100%', flexShrink: 0 }}
                />
                {/* 类型标记 */}
                <span
                  className="absolute text-[8px] font-bold text-white/50 pointer-events-none"
                  style={{ left: preW + 2, top: 1 }}
                >
                  {skill.type.toUpperCase()}
                </span>
                {/* 删除按钮 */}
                <button
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeSkillBlock(slotIndex, i)}
                  className="absolute -right-1 -top-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-600/80 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-30"
                  title="删除技能"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}

        {/* 拖拽预览线 */}
        {dragOverFrame !== null && (
          <div
            className="absolute top-0 w-px bg-blue-400/60 z-10 pointer-events-none"
            style={{ left: dragOverFrame * pxPerFrame, height: '100%' }}
          />
        )}

        {(!student || skills.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-gray-600">
              {student ? t.timeline.empty_hint : ''}
            </span>
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
