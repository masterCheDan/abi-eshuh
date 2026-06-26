import { useState, useMemo } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { computeCostTimeline, costAtFrame } from '../../utils/costCalc'

interface CostTrackProps {
    pxPerFrame: number
    totalWidth: number
}

const HEIGHT = 120
const PADDING_Y = 8

function formatMs(f: number): string {
    const totalSeconds = Math.floor(f / 30)
    const ms = Math.round((f / 30 - totalSeconds) * 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function formatSecFrame(f: number): string {
    const totalSeconds = Math.floor(f / 30)
    const fr = f % 30
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')} 第${fr}帧`
}

export function CostTrack({ pxPerFrame, totalWidth }: CostTrackProps) {
    const lanes = useTimelineStore((s) => s.lanes)
    const mode = useSquadStore((s) => s.config.mode)
    const maxCost = mode === 'normal' ? 10 : 20
    const [hoverInfo, setHoverInfo] = useState<{ frame: number; cost: number; x: number } | null>(null)

    const timeline = useMemo(() => computeCostTimeline(lanes, mode), [lanes, mode])

    const points = useMemo(() => {
        if (timeline.length === 0) return ''
        const chartH = HEIGHT - PADDING_Y * 2
        return timeline
            .map((p) => {
                const x = p.frame * pxPerFrame
                const y = PADDING_Y + chartH - (p.cost / maxCost) * chartH
                return `${x},${y.toFixed(1)}`
            })
            .join(' ')
    }, [timeline, pxPerFrame, maxCost])

    const costLabels = useMemo(() => {
        const labels: number[] = []
        for (let c = 0; c <= maxCost; c += 2) labels.push(c)
        return labels
    }, [maxCost])

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const offsetX = e.clientX - rect.left
        const frame = Math.round(Math.max(0, offsetX / pxPerFrame))
        const cost = costAtFrame(timeline, frame)
        setHoverInfo({ frame, cost, x: offsetX })
    }
    const handleMouseLeave = () => setHoverInfo(null)

    if (lanes.every(l => !l.student)) {
        return (
            <div className="flex border-b shrink-0" style={{ height: HEIGHT, borderColor: 'var(--border-light)' }}>
                <div className="sticky left-0 z-10 flex items-center px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                    <span className="text-xs text-gray-600 uppercase">Cost</span>
                </div>
                <div className="relative flex-1" />
            </div>
        )
    }

    const costText = hoverInfo ? hoverInfo.cost.toFixed(1) : ''
    const [intPart, decPart] = costText ? costText.split('.') : ['0', '0']

    return (
        <div className="flex border-b shrink-0" style={{ height: HEIGHT, borderColor: 'var(--border-light)' }}>
            <div className="sticky left-0 z-10 flex items-center px-3 border-r shrink-0 w-36" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <span className="text-xs text-gray-600 uppercase">Cost</span>
            </div>

            <div
                className="relative flex-1 bg-gray-900/20"
                style={{ minWidth: totalWidth }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {costLabels.map((c) => {
                    const chartH = HEIGHT - PADDING_Y * 2
                    const y = PADDING_Y + chartH - (c / maxCost) * chartH
                    return (
                        <div key={c} className="absolute left-0 right-0 flex items-center" style={{ top: y }}>
                            <div className="absolute left-0 right-0 border-t border-gray-700/40" style={{ top: 0 }} />
                            <span className="absolute left-1 text-[10px] text-gray-500">{c}</span>
                        </div>
                    )
                })}

                <svg className="absolute inset-0" width="100%" height={HEIGHT} style={{ overflow: 'visible' }}>
                    <polyline
                        points={points}
                        fill="none"
                        stroke="#facc15"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>

                {hoverInfo && (
                    <>
                        <div
                            className="absolute top-0 bottom-0 w-px bg-yellow-400/50 pointer-events-none z-20"
                            style={{ left: hoverInfo.x }}
                        />
                        <div
                            className="absolute z-30 pointer-events-none bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                            style={{ left: Math.min(hoverInfo.x + 8, totalWidth - 200), top: 4 }}
                        >
                            {/* 时间 */}
                            <span className="text-xs text-gray-200 font-game">
                                {formatMs(hoverInfo.frame)}
                            </span>
                            <span className="text-[10px] text-gray-500 ml-1">
                                ({formatSecFrame(hoverInfo.frame)})
                            </span>
                            {/* COST — 数字font-game, 小数点加粗默认体 */}
                            <span className="text-xs text-yellow-300 ml-2">
                                <span className="font-game font-semibold">{intPart}</span>
                                <span className="font-bold text-yellow-400">.</span>
                                <span className="font-game font-semibold">{decPart}</span>
                                <span className="font-game font-semibold"> COST</span>
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
