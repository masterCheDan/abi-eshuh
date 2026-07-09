import { useRef, useState, useEffect } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSimulationStore, getSimulationSummary } from '../../stores/useSimulationStore'
import { useBossStore } from '../../stores/useBossStore'
import { TimelineLane } from './TimelineLane'
import { AttackTrack } from './AttackTrack'
import { BuffTrack } from './BuffTrack'
import { TriggerTrack } from './TriggerTrack'
import { CostTrack } from './CostTrack'
import { BossTrack } from './BossTrack'
import { SimulationErrorPanel } from './SimulationErrorPanel'
import { TimelineRuler } from './TimelineRuler'
import { useI18n } from '../../i18n'

const BASE_PX_PER_FRAME = 2
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function Timeline() {
  const { t } = useI18n()
  const lanes = useTimelineStore((s) => s.lanes)
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
  const totalFrames = bossDurationSec * 30

  const pxPerFrame = BASE_PX_PER_FRAME * zoom
  const totalWidth = totalFrames * pxPerFrame

  /** 原生绑 wheel 事件以使用 passive: false */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (scrollMode === 'pan') {
        el.scrollLeft += e.deltaY
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
    <div className="flex flex-col h-full rounded-lg border" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t.timeline.title}</span>
          {simComputing && (
            <span className="text-[10px] text-gray-600 animate-pulse">⏳</span>
          )}
          {summary && summary.total > 0 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              {summary.total} 问题
            </span>
          )}
          {summary && summary.total === 0 && !simComputing && lanes.some(l => l.student) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
              ✓ 合法
            </span>
          )}
          {summary?.window && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded cursor-help font-game"
              style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
              title={
                `滑动窗口: ${summary.window.left}/${summary.window.deck.length} 已消费` +
                `\n手牌大小: ${summary.window.size}`
              }
            >
              🂠 {summary.window.left}/{summary.window.deck.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleScrollMode}
            className="px-1.5 py-0.5 text-[10px] rounded text-gray-300"
            style={{ background: scrollMode === 'pan' ? 'rgba(59,130,246,0.25)' : 'var(--bg-surface-alt)' }}
            title={scrollMode === 'zoom' ? '滚轮：缩放（点击切换为平移）' : '滚轮：平移（点击切换为缩放）'}
          >
            {scrollMode === 'zoom' ? '🔍' : '✋'}
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            −
          </button>
          <span className="text-[10px] text-gray-400 w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            +
          </button>
        </div>
      </div>

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
                    <AttackTrack lane={lane} pxPerFrame={pxPerFrame} />
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

