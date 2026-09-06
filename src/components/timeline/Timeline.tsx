import { useRef, useState, useEffect } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSimulationStore, getSimulationSummary } from '../../stores/useSimulationStore'
import { useBossStore } from '../../stores/useBossStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { rules } from '../../domain/rules/GameRules'
import { scheduleNsBlocks } from '../../utils/nsSchedule'
import { TimelineLane } from './TimelineLane'
import { NsSuggestionTrack } from './NsSuggestionTrack'
import { AttackTrack } from './AttackTrack'
import { BuffTrack } from './BuffTrack'
import { TriggerTrack } from './TriggerTrack'
import { CostTrack } from './CostTrack'
import { BossTrack } from './BossTrack'
import { SimulationErrorPanel } from './SimulationErrorPanel'
import { TimelineRuler } from './TimelineRuler'
import { useI18n, tpl } from '../../i18n'

const BASE_PX_PER_FRAME = 2
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function Timeline() {
  const { t } = useI18n()
  const lanes = useTimelineStore((s) => s.lanes)
  const frameLimit = useTimelineStore(s => s.frameLimit)
  const simResult = useSimulationStore((s) => s.result)
  const simComputing = useSimulationStore((s) => s.computing)
  const summary = getSimulationSummary(simResult)
  const getSelectedBoss = useBossStore((s) => s.getSelectedBoss)
  const selectedDifficulty = useBossStore((s) => s.selectedDifficulty)
  const selectedBoss = getSelectedBoss()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollMode = useTimelineStore((s) => s.scrollMode)
  const toggleScrollMode = useTimelineStore((s) => s.toggleScrollMode)
  const [zoom, setZoom] = useState(1)
  const [collapsedLanes, setCollapsedLanes] = useState<Set<number>>(new Set())
  const [highlightedFrame, setHighlightedFrame] = useState<number | null>(null)

  /** 跳转到帧 + 高亮对应 EX 块 */
  const handleJumpToFrame = (frame: number) => {
    setHighlightedFrame(frame)
    setTimeout(() => setHighlightedFrame(null), 1500)
  }

  const toggleLane = (slotIndex: number) =>
    setCollapsedLanes(prev => {
      const next = new Set(prev)
      if (prev.has(slotIndex)) next.delete(slotIndex)
      else next.add(slotIndex)
      return next
    })

  // 使用 Boss 时长或默认 3 分钟
  const bossDurationSec = selectedBoss
    ? (selectedBoss.BattleDuration[selectedDifficulty] ?? 180)
    : 180
  const totalFrames = frameLimit ?? bossDurationSec * 30

  /** Legacy prequeue never writes an automatic fact. Anything outside the reviewed engine scheduler stays a suggestion. */
  const refreshNsSuggestions = () => {
    const timeline = useTimelineStore.getState()
    const squadSlots = useSquadStore.getState().config.slots
    const suggestions = timeline.lanes.flatMap(lane => {
      if (!lane.student) return []
      const gearLevel = squadSlots[lane.slotIndex]?.gearLevel ?? 1
      const rule = rules.nsTrigger.rule(lane.student.Id)
      if (!rule) return []
      const blocks = scheduleNsBlocks({ lane, student: lane.student, rule, totalFrames, gearLevel })
      const reviewed = rules.nsScheduling.eligibility(lane.student, gearLevel).eligible
      const intervalCandidates = reviewed ? [] : blocks.automatic.map(block => ({
        id: `review-${block.eventId ?? `${lane.slotIndex}-${block.startFrame}`}`,
        slotIndex: lane.slotIndex,
        block: { ...block, eventId: `ns-confirmed-${block.eventId ?? `${lane.slotIndex}-${block.startFrame}`}`,
          triggerSource: 'manual' as const, trigger: { source: 'manual' as const, reasons: ['interval' as const] } },
      }))
      return [...blocks.suggestions, ...intervalCandidates]
    })
    timeline.replaceSuggestions(suggestions)
  }

  const pxPerFrame = BASE_PX_PER_FRAME * zoom
  const totalWidth = totalFrames * pxPerFrame

  /** 原生绑 wheel 事件以使用 passive: false */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (scrollMode === 'pan') {
        // deltaMode 1 = 行滚动 (Firefox)，换算为像素
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        el.scrollLeft += delta
      } else {
        setZoom((prev) => {
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
          return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta))
        })
      }
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [scrollMode])

  return (
    <div className="ba-panel ba-cut-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="ba-eyebrow">{t.timeline.title}</span>
          {simComputing && (
            <span className="text-[10px] text-gray-600 animate-pulse">⏳</span>
          )}
          {summary && summary.total > 0 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)' }}
            >
              {tpl(t.timeline.problems, { n: summary.total })}
            </span>
          )}
          {summary && summary.total === 0 && !simComputing && lanes.some(l => l.student) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--ok) 10%, transparent)', color: 'var(--ok)' }}>
              {t.timeline.valid}
            </span>
          )}
          {summary?.window && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded cursor-help font-game"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              title={
                tpl(t.timeline.window_consumed, { left: summary.window.left, total: summary.window.deck.length }) +
                `\n${tpl(t.timeline.window_size, { size: summary.window.size })}`
              }
            >
              🂠 {summary.window.left}/{summary.window.deck.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refreshNsSuggestions} className="ba-cut-btn px-1.5 py-0.5 text-[10px] text-gray-300"
            style={{ background: 'var(--bg-surface-alt)' }} title="生成尚未通过自动调度审查的 NS 待确认建议；不会写入自动施放事实">
            ⏱ 建议
          </button>
          <button
            onClick={toggleScrollMode}
            className="ba-cut-btn px-1.5 py-0.5 text-[10px] text-gray-300"
            style={{ background: scrollMode === 'pan' ? 'var(--accent-soft)' : 'var(--bg-surface-alt)' }}
            title={scrollMode === 'zoom' ? t.timeline.scroll_zoom_hint : t.timeline.scroll_pan_hint}
          >
            {scrollMode === 'zoom' ? '🔍' : '✋'}
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className="ba-cut-btn px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            −
          </button>
          <span className="text-[10px] text-gray-400 w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="ba-cut-btn px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            +
          </button>
        </div>
      </div>

      {frameLimit != null && <button className="text-xs text-left text-amber-300" onClick={() => useTimelineStore.getState().setTotalFrames(null)}>导入时长：{frameLimit} 帧；点击恢复 Boss 默认时长</button>}
      {/* 标尺 + 轨道共用同一个水平滚动容器 */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
        <div style={{ width: totalWidth, minHeight: '100%', paddingBottom: 48 }} className="relative">
          <TimelineRuler totalFrames={totalFrames} pxPerFrame={pxPerFrame} />
          <CostTrack pxPerFrame={pxPerFrame} totalWidth={totalWidth} />
          <BossTrack
            totalWidth={totalWidth}
            totalFrames={totalFrames}
            bossName={selectedBoss?.Name}
            armorType={selectedBoss?.ArmorType}
          />

          {lanes.map((lane) => {
            const isCollapsed = collapsedLanes.has(lane.slotIndex)
            return (
              <div key={lane.slotIndex}>
                <TimelineLane
                  lane={lane}
                  pxPerFrame={pxPerFrame}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => toggleLane(lane.slotIndex)}
                  highlightedFrame={highlightedFrame}
                />
                {!isCollapsed && (
                  <>
                    <NsSuggestionTrack lane={lane} pxPerFrame={pxPerFrame} />
                    <AttackTrack lane={lane} pxPerFrame={pxPerFrame} totalFrames={totalFrames} />
                    <BuffTrack lane={lane} pxPerFrame={pxPerFrame} />
                    <TriggerTrack lane={lane} pxPerFrame={pxPerFrame} />
                  </>
                )}
              </div>
            )
          })}

        </div>
      </div>

      {/* 问题面板（IDE风格） */}
      <SimulationErrorPanel
        errors={summary?.errors ?? []}
        pxPerFrame={pxPerFrame}
        scrollRef={scrollRef}
        onJumpToFrame={handleJumpToFrame}
      />
    </div>
  )
}

