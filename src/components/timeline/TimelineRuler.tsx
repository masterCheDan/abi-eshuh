interface TimelineRulerProps {
  totalFrames: number
  pxPerFrame: number
}

const MAIN_TICK_INTERVAL = 150 // 5秒 @ 30fps
const SUB_TICK_INTERVAL = 30   // 1秒 @ 30fps

export function TimelineRuler({ totalFrames, pxPerFrame }: TimelineRulerProps) {
  const ticks: { frame: number; isMain: boolean }[] = []

  for (let f = 0; f <= totalFrames; f += SUB_TICK_INTERVAL) {
    ticks.push({ frame: f, isMain: f % MAIN_TICK_INTERVAL === 0 })
  }

  return (
    <div
      className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 flex shrink-0"
      style={{ height: 28 }}
    >
      {/* 与左侧标签等宽的占位（w-28 = 7rem = 112px） */}
      <div className="w-28 shrink-0 border-r border-gray-700" />

      {/* 刻度尺区域 */}
      <div style={{ width: totalFrames * pxPerFrame, position: 'relative', height: '100%' }}>
        {ticks.map(({ frame, isMain }) => {
          const x = frame * pxPerFrame
          const seconds = Math.floor(frame / 30)
          const secs = seconds % 60
          const mins = Math.floor(seconds / 60)
          return (
            <div key={frame} className="absolute top-0" style={{ left: x }}>
              <div
                className="bg-gray-500"
                style={{ width: 1, height: isMain ? 14 : 8 }}
              />
              {isMain && (
                <span className="absolute text-[10px] text-gray-400 select-none whitespace-nowrap left-0.5 top-3">
                  {mins}:{String(secs).padStart(2, '0')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
