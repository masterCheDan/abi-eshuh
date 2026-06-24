import { useState, useCallback, useMemo } from 'react'
import type { DragEvent } from 'react'
import type { StudentLane, SkillBlock } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { DRAG_SKILL_KEY } from '../skill-panel/SkillAddForm'
import { useI18n } from '../../i18n'

/** 用于内部拖拽移动的 dataTransfer 键名 */
const DRAG_MOVE_KEY = 'tl-skill-move'

interface TimelineLaneProps {
  lane: StudentLane
  pxPerFrame: number
}

const LANE_HEIGHT = 48

/** 技能块在时间轴上的颜色配置 */
const SKILL_COLORS: Record<SkillBlock['type'], { pre: string; active: string; after: string; label: string }> = {
  ex: {
    pre: 'bg-blue-500/30 border-l border-blue-400',
    active: 'bg-blue-600/60',
    after: 'bg-blue-400/15 border-r border-dashed border-blue-400/40',
    label: 'text-blue-200',
  },
  ns: {
    pre: 'bg-emerald-500/30 border-l border-emerald-400',
    active: 'bg-emerald-600/60',
    after: 'bg-emerald-400/15 border-r border-dashed border-emerald-400/40',
    label: 'text-emerald-200',
  },
  ss: {
    pre: 'bg-amber-500/30 border-l border-amber-400',
    active: 'bg-amber-600/60',
    after: 'bg-amber-400/15 border-r border-dashed border-amber-400/40',
    label: 'text-amber-200',
  },
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
  // ── 获取技能基础数据 ──
  let animDuration = 60
  let effects: typeof student.Skills.E.Effects = []

  if (skill.type === 'ex') {
    const ex = student.Skills.E
    animDuration = ex.Duration
    effects = ex.Effects
  } else if (skill.type === 'ns') {
    const hasGear = student.HasGear
    const pub = hasGear ? student.Skills.G : student.Skills.P
    animDuration = pub.Duration || 60
    effects = pub.Effects
  } else if (skill.type === 'ss') {
    const ep = student.Skills.EP
    animDuration = 0
    effects = ep.Effects
  }

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

  // ── 从技能面板拖入 / 内部移动 ──
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverFrame(null)

    // 计算技能足迹
    const getFootprint = (s: SkillBlock) => {
      const segs = getSkillSegments(s, student!)
      return segs.preCast + Math.max(segs.active, segs.afterEffect)
    }

    // 构建现有技能区间
    const buildRanges = (excludeIndex?: number): SkillRange[] =>
      skills
        .map((s, i) => {
          if (i === excludeIndex) return null
          return { start: s.startFrame, end: s.startFrame + getFootprint(s) }
        })
        .filter((r): r is SkillRange => r !== null)

    // ── 内部拖拽移动（所有类型：自身后移避让） ──
    const moveData = e.dataTransfer.getData(DRAG_MOVE_KEY)
    if (moveData) {
      const { skillIndex, fromSlotIndex } = JSON.parse(moveData)
      const ranges = buildRanges(skillIndex)
      const footprint = getFootprint(skills[skillIndex])
      const frame = snapToNonOverlap(ranges, frameFromEvent(e), footprint)
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
      // ═══ EX 技能：优先级最高，NS/SS 为其让路 ═══

      // 1. 与已有 EX 冲突 → 自身后移
      const exRanges = skills
        .filter((s) => s.type === 'ex')
        .map((s) => ({ start: s.startFrame, end: s.startFrame + getFootprint(s) }))
      const finalFrame = snapToNonOverlap(exRanges, proposedFrame, footprint)

      // 2. 找出被挤出位置的 NS/SS（按 index 降序避免位移）
      const pushedNS = skills
        .map((s, i) => ({ skill: s, index: i }))
        .filter(({ skill }) => skill.type !== 'ex')
        .filter(({ skill }) => {
          const end = skill.startFrame + getFootprint(skill)
          return skill.startFrame < finalFrame + footprint && end > finalFrame
        })
        .sort((a, b) => b.index - a.index)

      // 3. 将 NS/SS 逐个推到 EX 之后
      let cursor = finalFrame + footprint
      for (const { index } of pushedNS) {
        moveSkillBlock(slotIndex, index, slotIndex, cursor)
        cursor += getFootprint(skills[index])
        // 注：moveSkillBlock 会修改 store，下一个 push 的 index 仍然有效（因为按降序处理）
      }

      addSkillBlock(lane.slotIndex, { ...dragged, startFrame: finalFrame })
    } else {
      // ═══ NS/SS 技能：避让所有已有技能 ═══
      const ranges = buildRanges()
      const frame = snapToNonOverlap(ranges, proposedFrame, footprint)
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
      className="flex border-b border-gray-800 last:border-b-0"
      style={{ height: LANE_HEIGHT }}
    >
      {/* 左侧固定标签 */}
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-gray-900 border-r border-gray-700 shrink-0 w-28">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] shrink-0 ${student ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
            }`}
        >
          {student ? student.Name.charAt(0) : '?'}
        </div>
        <div className="min-w-0">
          <div className={`text-xs font-medium leading-tight ${student ? 'text-gray-200' : 'text-gray-600'}`}>
            {label}
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

          // 从学生技能数据推导三段参数
          const segs = getSkillSegments(skill, student)
          const preW = segs.preCast * pxPerFrame
          const activeW = segs.active * pxPerFrame
          const afterW = segs.afterEffect * pxPerFrame
          const colors = SKILL_COLORS[skill.type]
          const row = skillRows[i] ?? 0

          // 垂直位置
          const topOffset = totalRows <= 1
            ? '50%'
            : `${((row + 0.5) / totalRows) * 100}%`

          return (
            <div key={i}>
              {/* ── 主技能块：前摇 + 生效 ── */}
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
                  className={colors.pre}
                  style={{ width: preW, height: '100%', flexShrink: 0 }}
                />
                {/* 生效段 */}
                <div
                  className={colors.active}
                  style={{ width: activeW, height: '100%', flexShrink: 0 }}
                />
                {/* 标签 */}
                <span
                  className={`absolute text-[10px] whitespace-nowrap pl-1 pointer-events-none ${colors.label}`}
                  style={{ left: 2, top: -14 }}
                >
                  {skill.name}
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

              {/* ── 后效条：从 ApplyFrame 位置开始，薄条在下层 ── */}
              {afterW > 0 && (
                <div
                  className={`absolute z-10 pointer-events-none ${colors.after}`}
                  style={{
                    left: x + preW,
                    top: topOffset,
                    transform: 'translateY(6px)',
                    width: afterW,
                    height: 4,
                    borderRadius: '0 2px 2px 0',
                  }}
                />
              )}
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
