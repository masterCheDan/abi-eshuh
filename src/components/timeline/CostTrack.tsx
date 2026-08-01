import { useState, useMemo } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { COST_SCALE } from '../../engine'

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
    const result = useSimulationStore((s) => s.result)
    const maxCost = (result?.maxCost ?? (mode === 'normal' ? 10 : 20) * COST_SCALE) / COST_SCALE
    const [hoverInfo, setHoverInfo] = useState<{ frame: number; cost: number; x: number } | null>(null)

    const timeline = useMemo(() => result?.costHistory.map((cost, frame) => ({ frame, cost })) ?? [], [result])
    const minCost = useMemo(() => Math.min(
        0,
        Math.floor(Math.min(0, ...timeline.map(point => point.cost / COST_SCALE))),
    ), [timeline])
    const costRange = Math.max(1, maxCost - minCost)

    const points = useMemo(() => {
        if (timeline.length === 0) return ''
        const chartH = HEIGHT - PADDING_Y * 2
        return timeline
            .map((p) => {
                const x = p.frame * pxPerFrame
                const y = PADDING_Y + ((maxCost - p.cost / COST_SCALE) / costRange) * chartH
                return `${x},${y.toFixed(1)}`
            })
            .join(' ')
    }, [timeline, pxPerFrame, maxCost, costRange])

    const costLabels = useMemo(() => {
        const labels = new Set<number>([minCost, 0, maxCost])
        for (let c = Math.ceil(minCost / 2) * 2; c <= maxCost; c += 2) labels.add(c)
        return [...labels].sort((left, right) => left - right)
    }, [maxCost, minCost])

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const offsetX = e.clientX - rect.left
        const frame = Math.round(Math.max(0, offsetX / pxPerFrame))
        const cost = timeline[Math.min(frame, timeline.length - 1)]?.cost ?? 0
        setHoverInfo({ frame, cost, x: offsetX })
    }
    const handleMouseLeave = () => setHoverInfo(null)

    if (lanes.every(l => !l.student)) {
        return (
            <div className="flex border-b shrink-0" style={{ height: HEIGHT, borderColor: 'var(--border-light)' }}>
                <div className="sticky left-0 z-10 flex items-center justify-center px-2 border-r shrink-0 w-20" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                    <span className="text-xs font-game text-gray-300 uppercase">Cost</span>
                </div>
                <div className="relative flex-1" />
            </div>
        )
    }

    const costText = hoverInfo ? (hoverInfo.cost / COST_SCALE).toFixed(1) : ''
    const [intPart, decPart] = costText ? costText.split('.') : ['0', '0']

    return (
        <div className="flex border-b shrink-0" style={{ height: HEIGHT, borderColor: 'var(--border-light)' }}>
            <div className="sticky left-0 z-10 flex flex-col items-center justify-center px-2 border-r shrink-0 w-20" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <span className="text-xs font-game text-gray-300 uppercase">Cost</span>
                <span className="mt-1 text-[9px] font-game" style={{ color: 'var(--cost)' }}>
                    上限 {Number.isInteger(maxCost) ? maxCost : maxCost.toFixed(1)}
                </span>
            </div>

            <div
                className="relative flex-1 bg-gray-900/20"
                style={{ minWidth: totalWidth }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {minCost < 0 && (
                    <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                            top: PADDING_Y + ((maxCost - 0) / costRange) * (HEIGHT - PADDING_Y * 2),
                            bottom: PADDING_Y,
                            background: 'rgba(251,191,36,0.055)',
                        }}
                    />
                )}
                {costLabels.map((c) => {
                    const chartH = HEIGHT - PADDING_Y * 2
                    const y = PADDING_Y + ((maxCost - c) / costRange) * chartH
                    return (
                        <div key={c} className="absolute left-0 right-0 flex items-center" style={{ top: y }}>
                            {/* 横向虚线 — Cost阈值 */}
                            <div className="absolute left-0 right-0" style={{
                                top: 0,
                                borderTop: '1px dashed',
                                borderColor: c === 0 ? 'rgba(251,191,36,0.55)' : 'var(--cost-soft)',
                            }} />
                            <span className="absolute left-1 text-[10px] text-gray-500 font-game">{c}</span>
                        </div>
                    )
                })}

                {/* 回费关键节点高亮标记 */}
                {timeline.filter((p, i) => {
                    if (i === 0) return false
                    const prev = timeline[i - 1]
                    return Math.floor(p.cost / COST_SCALE) > Math.floor(prev.cost / COST_SCALE)
                }).map((p, i) => {
                    const chartH = HEIGHT - PADDING_Y * 2
                    const x = p.frame * pxPerFrame
                    const y = PADDING_Y + ((maxCost - p.cost / COST_SCALE) / costRange) * chartH
                    return (
                        <div
                            key={`regen-${i}`}
                            className="absolute pointer-events-none"
                            style={{
                                left: x - 3,
                                top: y - 3,
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--cost)',
                                opacity: 0.5,
                                boxShadow: '0 0 3px var(--cost-soft)',
                            }}
                        />
                    )
                })}

                <svg className="absolute inset-0" width="100%" height={HEIGHT} style={{ overflow: 'visible' }}>
                    <polyline
                        points={points}
                        fill="none"
                        stroke="var(--cost)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>

                {hoverInfo && (
                    <>
                        <div
                            className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                            style={{ left: hoverInfo.x, background: 'var(--cost)', opacity: 0.5 }}
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
                            <span className="text-xs ml-2" style={{ color: 'var(--cost)' }}>
                                <span className="font-game font-semibold">{intPart}</span>
                                <span className="font-bold">.</span>
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
