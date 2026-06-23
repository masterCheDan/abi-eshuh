interface TimelineRulerProps {
  totalFrames: number
  pxPerFrame: number
}

/** 每 5 秒（150帧）一个主刻度，每 1 秒（30帧）一个次刻度 */
const MAIN_TICK_INTERVAL = 150 // 5秒 @ 30fps
const SUB_TICK_INTERVAL = 30   // 1秒 @ 30fps

export function TimelineRuler({ totalFrames, pxPerFrame }: TimelineRulerProps) {
  const ticks: { frame: number; isMain: boolean }[] = []

  for (let f = 0; f <= totalFrames; f += SUB_TICK_INTERVAL) {
    ticks.push({ frame: f, isMain: f % MAIN_TICK_INTERVAL === 0 })
  }

  return (
    <div
      className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 overflow-hidden"
      style={{ height: 28 }}
    >
      <div style={{ width: totalFrames * pxPerFrame, position: 'relative', height: '100%' }}>
        {ticks.map(({ frame, isMain }) => {
          const x = frame * pxPerFrame
          const seconds = Math.floor(frame / 30)
          const secs = seconds % 60
          const mins = Math.floor(seconds / 60)
          return (
            <div
              key={frame}
              className="absolute top-0"
              style={{ left: x }}
            >
              {/* 刻度线 */}
              <div
                className="bg-gray-500"
                style={{
                  width: 1,
                  height: isMain ? 14 : 8,
                }}
              />
              {/* 主刻度标签 */}
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
