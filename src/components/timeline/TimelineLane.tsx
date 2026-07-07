import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { DragEvent } from 'react'
import type { StudentLane, SkillBlock } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { DRAG_SKILL_KEY } from '../skill-panel/SkillAddForm'
import { SkillIcon } from '../skill-panel/SkillIcon'
import { studentSkillStyles } from '../../utils/studentColors'
import { computeCostTimeline, costAtFrame, COST_SCALE } from '../../utils/costCalc'
import type { CostFrame } from '../../utils/costCalc'
import { CalibrationMenu } from './CalibrationMenu'
import { useI18n } from '../../i18n'

/** 用于内部拖拽移动的 dataTransfer 键名 */
const DRAG_MOVE_KEY = 'tl-skill-move'

interface TimelineLaneProps {
  lane: StudentLane
  pxPerFrame: number
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  highlightedFrame?: number | null
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

/** 智能磁吸：若目标帧在 Cost 整数节点 ±30 帧范围内，吸附到该节点 */
function snapToCostNode(
  frame: number,
  costTimeline: CostFrame[],
  maxCost: number,
): number {
  const snapRange = 30 // 吸附半径 (1秒)
  let bestFrame = frame
  let bestDist = snapRange + 1

  for (let c = 1; c <= maxCost; c++) {
    // 找到 Cost 从 <c 跨越到 ≥c 的关键帧
    const threshold = c * COST_SCALE
    let lo = 0
    let hi = costTimeline.length - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (costTimeline[mid].cost < threshold) lo = mid
      else hi = mid - 1
    }
    const keyFrame = Math.min(lo + 1, costTimeline.length - 1)
    const nodeFrame = costTimeline[keyFrame]?.frame ?? 0

    const dist = Math.abs(nodeFrame - frame)
    if (dist < bestDist) {
      bestDist = dist
      bestFrame = nodeFrame
    }
  }

  return bestDist <= snapRange ? bestFrame : frame
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
    animDuration = skill.skillDuration ?? student.Skills.E.Duration
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

export function TimelineLane({ lane, pxPerFrame, isCollapsed, onToggleCollapse, highlightedFrame }: TimelineLaneProps) {
  const { t } = useI18n()
  const { label, student, studentId, skills, slotIndex } = lane
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const moveSkillBlock = useTimelineStore((s) => s.moveSkillBlock)
  const removeSkillBlock = useTimelineStore((s) => s.removeSkillBlock)
  const updateSkillBlock = useTimelineStore((s) => s.updateSkillBlock)
  const allLanes = useTimelineStore((s) => s.lanes)
  const squadMode = useSquadStore((s) => s.config.mode)
  const costTimeline = useMemo(() => computeCostTimeline(allLanes, squadMode), [allLanes, squadMode])
  const [dragOverFrame, setDragOverFrame] = useState<number | null>(null)
  const [calibrationTarget, setCalibrationTarget] = useState<{ skillIndex: number; x: number; y: number } | null>(null)
  const calibRef = useRef<{ skillIndex: number; startMouseX: number; startOffset: number } | null>(null)

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

  // 排除本轨道的 Cost 曲线（用于渲染层越界检测，避免技能自身影响判定）
  const costExcludingLane = useMemo(() => {
    const lanesWithout = allLanes.map(l =>
      l.slotIndex === slotIndex
        ? { ...l, skills: [] }
        : l
    )
    return computeCostTimeline(lanesWithout, squadMode)
  }, [allLanes, squadMode, slotIndex])

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
      let costTimelineRef: CostFrame[] = costTimeline

      if (moved.type === 'ex') {
        // 排除自身后重新计算 Cost（避免被拖卡自己的扣减拦住前移）
        const lanesWithoutSelf = allLanes.map(l => {
          if (l.slotIndex !== slotIndex) return l
          return { ...l, skills: l.skills.filter((_, i) => i !== skillIndex) }
        })
        costTimelineRef = computeCostTimeline(lanesWithoutSelf, squadMode)
        const exCost = (moved.skillCost ?? student!.Skills.E.Cost[0]) * COST_SCALE
        while (frame <= 5400) {
          while (globalExFrames.has(frame)) frame++
          if (frame > 5400 || costAtFrame(costTimelineRef, frame) >= exCost) break
          frame++
        }
        if (frame > 5400) return
      }

      // 智能磁吸 → Cost 整数节点
      const maxCost = squadMode === 'normal' ? 10 : 20
      frame = snapToCostNode(frame, costTimelineRef, maxCost)

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

      // 规则2+3：跨轨道 EX 唯一 + COST 充足，合并循环到全部满足
      {
        const exCost = (dragged.skillCost ?? student!.Skills.E.Cost[0]) * COST_SCALE
        while (finalFrame <= 5400) {
          while (globalExFrames.has(finalFrame)) finalFrame++
          if (finalFrame > 5400 || costAtFrame(costTimeline, finalFrame) >= exCost) break
          finalFrame++
        }
        if (finalFrame > 5400) return
      }

      // 智能磁吸 → Cost 整数节点
      const maxCost = squadMode === 'normal' ? 10 : 20
      finalFrame = snapToCostNode(finalFrame, costTimeline, maxCost)

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
    const skill = skills[skillIndex]
    // Alt+drag: cancel HTML5 drag, use mouse events for calibration
    if (e.altKey && (skill.type === 'ns' || skill.type === 'ss')) {
      e.preventDefault()
      calibRef.current = {
        skillIndex,
        startMouseX: e.clientX,
        startOffset: skill.overrideOffset ?? 0,
      }
      return
    }
    calibRef.current = null
    e.dataTransfer.setData(DRAG_MOVE_KEY, JSON.stringify({ skillIndex, fromSlotIndex: slotIndex }))
    e.dataTransfer.effectAllowed = 'move'
  }

  // ── 鼠标移动：Alt 校准持续追踪 ──
  useEffect(() => {
    if (!calibRef.current) return
    const handler = (e: MouseEvent) => {
      if (!calibRef.current) return
      const dx = e.clientX - calibRef.current.startMouseX
      const frameDelta = Math.round(dx / pxPerFrame)
      const newOffset = calibRef.current.startOffset + frameDelta
      updateSkillBlock(slotIndex, calibRef.current.skillIndex, { overrideOffset: newOffset })
    }
    const up = () => { calibRef.current = null }
    window.addEventListener('mousemove', handler)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', handler)
      window.removeEventListener('mouseup', up)
    }
  }, [pxPerFrame, slotIndex, updateSkillBlock])

  // ── 右键校准菜单 ──
  const handleContextMenu = (e: React.MouseEvent, skillIndex: number) => {
    e.preventDefault()
    setCalibrationTarget({ skillIndex, x: e.clientX, y: e.clientY })
  }

  return (
    <div
      className="flex border-b last:border-b-0"
      style={{ height: LANE_HEIGHT, borderColor: 'var(--border-light)' }}
    >
      {/* 左侧固定标签 */}
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] shrink-0 ${student ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
            }`}
        >
          {student ? student.Name.charAt(0) : '?'}
        </div>
        <div className="min-w-0 flex-1">
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
        {/* 折叠/展开切换 */}
        {student && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 text-[10px] shrink-0"
            style={{ color: 'var(--text-muted)' }}
            title={isCollapsed ? '展开 FSM 轨道' : '折叠 FSM 轨道'}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
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
          const isEx = skill.type === 'ex'

          // 高亮：错误面板点击时对应帧的 EX 块闪烁
          const isHighlighted = highlightedFrame != null && skill.startFrame === highlightedFrame && isEx

          // 越界爆红检测：全局帧冲突 / Cost 不足（使用排除本轨道的 Cost 曲线）
          const isWarning = isEx && (() => {
            if (globalExFrames.has(skill.startFrame)) return true
            const exCost = (skill.skillCost ?? student.Skills.E.Cost[0]) * COST_SCALE
            return costAtFrame(costExcludingLane, skill.startFrame) < exCost
          })()

          const topOffset = totalRows <= 1
            ? '50%'
            : `${((row + 0.5) / totalRows) * 100}%`

          const fmt = (f: number) => {
            const totalSeconds = Math.floor(f / 30)
            const ms = Math.round((f / 30 - totalSeconds) * 1000)
            const m = Math.floor(totalSeconds / 60)
            const s = totalSeconds % 60
            return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
          }

          return (
            <div key={i}>
              <div
                draggable
                onDragStart={(e) => handleSkillDragStart(e, i)}
                onDragOver={(e) => { e.stopPropagation(); e.preventDefault() }}
                onContextMenu={(e) => (skill.type === 'ns' || skill.type === 'ss') && handleContextMenu(e, i)}
                className="absolute flex items-center cursor-grab active:cursor-grabbing z-20 group"
                style={{
                  left: x,
                  top: topOffset,
                  transform: 'translateY(-50%)',
                  height: BLOCK_HEIGHT,
                }}
              >
                {/* NS/SS 人工校准偏移：虚线延伸指示器 */}
                {(skill.type === 'ns' || skill.type === 'ss') && (skill.overrideOffset ?? 0) !== 0 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      ...(skill.overrideOffset! > 0
                        ? { left: '100%', width: skill.overrideOffset! * pxPerFrame, borderTop: '1px dashed rgba(168,85,247,0.6)' }
                        : { right: '100%', width: -skill.overrideOffset! * pxPerFrame, borderTop: '1px dashed rgba(168,85,247,0.6)' }
                      ),
                    }}
                  />
                )}
                {/* 前摇段 */}
                <div
                  style={{ ...st.preStyle, width: preW, height: '100%', flexShrink: 0, position: 'relative' }}
                >
                  {/* Keyframe: 生效帧竖线 */}
                  <div
                    className="absolute top-0 bottom-0 w-px z-10"
                    style={{ right: 0, background: 'rgba(255,255,255,0.4)', boxShadow: '0 0 2px rgba(255,255,255,0.3)' }}
                  />
                </div>
                {/* 生效段 */}
                <div
                  style={{ ...st.activeStyle, width: activeW, height: '100%', flexShrink: 0, position: 'relative' }}
                >
                  {/* 右端截断效果 (Visual Cut) */}
                  <div
                    className="absolute top-0 bottom-0 w-1 z-10 opacity-60"
                    style={{
                      right: -0.5,
                      background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
                    }}
                  />
                </div>
                {/* 类型标记 */}
                <span
                  className="absolute text-[8px] font-bold text-white/50 pointer-events-none"
                  style={{ left: preW + 2, top: 1 }}
                >
                  {skill.type.toUpperCase()}
                </span>

                {/* 人工校准锁图标 */}
                {(skill.type === 'ns' || skill.type === 'ss') && (skill.overrideOffset ?? 0) !== 0 && (
                  <span
                    className="absolute text-[7px] pointer-events-none"
                    style={{ left: preW + (skill.type === 'ns' ? 16 : 14), top: 1, color: '#c084fc' }}
                    title={`已校准: ${skill.overrideOffset}帧`}
                  >
                    ⚙
                  </span>
                )}

                {/* 越界爆红纹理 */}
                {isWarning && (
                  <div
                    className="absolute inset-0 rounded-sm pointer-events-none z-10"
                    style={{
                      background: `repeating-linear-gradient(135deg, rgba(239,68,68,0.25) 0px, rgba(239,68,68,0.25) 3px, transparent 3px, transparent 6px)`,
                      border: '1px solid rgba(239,68,68,0.5)',
                    }}
                  />
                )}

                {/* 高亮光圈 */}
                {isHighlighted && (
                  <div
                    className="absolute -inset-[2px] rounded-[4px] pointer-events-none z-10"
                    style={{
                      border: '2px solid #facc15',
                      background: 'rgba(250,204,21,0.12)',
                      boxShadow: '0 0 12px 2px rgba(250,204,21,0.45)',
                      animation: 'highlightPulse 1.5s ease-out',
                    }}
                  />
                )}

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

                {/* ── 悬浮详情卡 ── */}
                <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block pointer-events-none">
                  <div className="rounded-lg border shadow-xl p-3 bg-gray-800 border-gray-700 text-gray-200 whitespace-nowrap min-w-[230px]">
                    {/* 1. 释放者 */}
                    <div className="flex items-center gap-2 mb-2">
                      <img src={`/icons/${student.Icon}.webp`} alt="" className="w-7 h-7 rounded-lg shrink-0 bg-gray-700" />
                      <span className="text-sm font-medium text-gray-100">{student.Name}</span>
                    </div>
                    {/* 2. 技能 */}
                    <div className="flex items-center gap-2 mb-2">
                      <SkillIcon icon={isEx ? student.Skills.E.Icon : ''} bulletType={student.BulletType} size={22} />
                      <span className="text-xs text-gray-300 truncate">{skill.name}</span>
                    </div>
                    <div className="h-px bg-gray-700 my-2" />
                    {/* 3. 时间 */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">释放</span>
                        <span className="font-mono text-gray-200">{fmt(skill.startFrame)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">生效</span>
                        <span className="font-mono text-emerald-300">{fmt(skill.startFrame + segs.preCast)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">动画结束</span>
                        <span className="font-mono text-gray-300">{fmt(skill.startFrame + segs.preCast + segs.active)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">前摇</span>
                        <span className="font-mono text-gray-400">{segs.preCast}帧</span>
                      </div>
                    </div>
                  </div>
                </div>
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

      {/* ── 校准菜单 ── */}
      {calibrationTarget && (
        <CalibrationMenu
          x={calibrationTarget.x}
          y={calibrationTarget.y}
          currentOffset={skills[calibrationTarget.skillIndex]?.overrideOffset ?? 0}
          onApply={(offset) => {
            const idx = calibrationTarget.skillIndex
            updateSkillBlock(slotIndex, idx, { overrideOffset: offset })
          }}
          onClose={() => setCalibrationTarget(null)}
        />
      )}
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
