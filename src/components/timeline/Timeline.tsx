import { useRef, useState, useEffect } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { TimelineLane } from './TimelineLane'
import { BuffTrack } from './BuffTrack'
import { TimelineRuler } from './TimelineRuler'

const BASE_PX_PER_FRAME = 2
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function Timeline() {
  const { lanes, totalFrames } = useTimelineStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  const pxPerFrame = BASE_PX_PER_FRAME * zoom
  const totalWidth = totalFrames * pxPerFrame

  /** 原生绑 wheel 事件以使用 passive: false */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta))
      })
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden border" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-[10px] text-gray-500">滚轮缩放</span>
        <div className="flex items-center gap-1">
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
        <div style={{ width: totalWidth, minHeight: '100%' }}>
          <TimelineRuler totalFrames={totalFrames} pxPerFrame={pxPerFrame} />

          {lanes.map((lane) => (
            <div key={lane.slotIndex}>
              <TimelineLane
                lane={lane}
                pxPerFrame={pxPerFrame}
              />
              <BuffTrack
                lane={lane}
                pxPerFrame={pxPerFrame}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

