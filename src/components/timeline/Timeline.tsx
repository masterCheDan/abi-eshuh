import { useRef, useCallback, useState } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { TimelineLane } from './TimelineLane'
import { TimelineRuler } from './TimelineRuler'
import { useI18n, tpl } from '../../i18n'

const BASE_PX_PER_FRAME = 2
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function Timeline() {
  const { t } = useI18n()
  const { lanes, totalFrames } = useTimelineStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  const pxPerFrame = BASE_PX_PER_FRAME * zoom
  const totalWidth = totalFrames * pxPerFrame

  const handleWheelCapture = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta))
      })
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-gray-700 bg-gray-800/50 shrink-0">
        <span className="text-[10px] text-gray-500">{t.timeline.zoom_hint}</span>
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

      <TimelineRuler totalFrames={totalFrames} pxPerFrame={pxPerFrame} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto"
        onWheelCapture={handleWheelCapture}
      >
        <div style={{ width: totalWidth, minHeight: '100%' }}>
          {lanes.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              {t.timeline.empty_hint}
            </div>
          )}

          {lanes.map((lane) => (
            <TimelineLane
              key={lane.studentId}
              lane={lane}
              pxPerFrame={pxPerFrame}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
