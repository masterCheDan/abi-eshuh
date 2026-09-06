import { useMemo } from 'react'
import type { StudentLane } from '../../types/timeline'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { actionTrackSegments, nsWaitingSegments } from './actionTrackModel'

interface AttackTrackProps {
  lane: StudentLane
  pxPerFrame: number
  totalFrames: number
}

const COLORS: Record<string, string> = { EX: '#eab308', NS: '#38bdf8', SS: '#c084fc', CC: '#f87171', AA: '#94a3b8', RELOAD: '#fb923c' }

export function AttackTrack({ lane, pxPerFrame, totalFrames }: AttackTrackProps) {
  const result = useSimulationStore(s => s.result)
  const computing = useSimulationStore(s => s.computing)
  // Hide stale output during recomputation: it belongs to previous user facts.
  const visibleResult = computing ? null : result
  const segments = useMemo(() => actionTrackSegments(visibleResult, lane.slotIndex, totalFrames)
    .filter(record => record.studentId === lane.studentId), [visibleResult, lane.slotIndex, lane.studentId, totalFrames])
  const diagnostics = useMemo(() => visibleResult?.schedulingDiagnostics.filter(d => d.studentId === lane.studentId) ?? [], [visibleResult, lane.studentId])
  const waits = useMemo(() => nsWaitingSegments(visibleResult, lane.slotIndex, totalFrames)
    .filter(record => record.studentId === lane.studentId), [visibleResult, lane.slotIndex, lane.studentId, totalFrames])
  const reasons = [...new Set(diagnostics.map(d => (d.frame == null ? '' : 'F' + d.frame + ' · ') + d.message))]

  return (
    <div className="flex border-b border-gray-800/30" style={{ height: 20 }}>
      <div className="sticky left-0 z-10 shrink-0 w-20 border-r border-gray-800/30" style={{ background: 'var(--bg-panel)' }}>
        {lane.student && (
          <details className="relative text-[9px]" style={{ color: 'var(--text-muted)' }}>
            <summary className="cursor-pointer px-1 py-0.5 whitespace-nowrap" title="查看动作记录与调度限制">
              {computing ? '计算中' : !result ? '待推演' : lane.student.SquadType === 'Main' ? '普攻未启用' : '实际动作'}
            </summary>
            <div className="absolute left-0 top-full z-30 w-80 max-h-48 overflow-y-auto rounded border p-2 shadow-lg" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
              <p>实心条显示引擎已接受的动作，底部虚线表示 NS 等待。上方技能块是用户尝试，失败不会生成这里的执行条。</p>
              {lane.student.SquadType === 'Main' && <p className="mt-1">普攻扣弹、完成与恢复规则尚未认证，暂不绘制推测普攻。攻击次数 NS 预排仍仅是待确认建议。</p>}
              {reasons.map(reason => <p className="mt-1" key={reason}>{reason}</p>)}
            </div>
          </details>
        )}
      </div>
      <div className="relative flex-1">
        {waits.map(wait => <div key={wait.id} tabIndex={0} className="absolute border-b border-dashed border-sky-400"
          style={{ left: wait.startFrame * pxPerFrame, top: 16, height: 3, width: Math.max(3, (wait.endFrame - wait.startFrame) * pxPerFrame) }}
          title={`NS 到期 F${wait.triggerFrame} · ${wait.reason === 'control' ? '受控等待' : '动作等待'} F${wait.startFrame}—F${wait.endFrame} · ${wait.castFrame == null ? '尚未释放' : `实际释放 F${wait.castFrame}`}`} />)}
        {segments.map(record => {
          const color = COLORS[record.actionType] ?? '#94a3b8'
          const width = (record.endFrame - record.startFrame) * pxPerFrame
          const status = record.status === 'interrupted' ? '中断于 F' + record.interruptedAt : record.status === 'completed' ? '已完成' : '模拟结束时仍在执行'
          return <div key={record.recordId} tabIndex={0}
            className="absolute flex items-center border-l overflow-hidden text-[8px]"
            style={{ left: record.startFrame * pxPerFrame, top: 3, width: Math.max(width, 3), height: 13,
              color, borderColor: color, background: 'color-mix(in srgb, ' + color + ' 22%, transparent)',
              borderRight: record.wasInterrupted ? '2px dashed ' + color : undefined }}
            title={record.actionType + ' · F' + record.startFrame + '—F' + record.endFrame + ' · ' + status + (record.triggerFrame == null ? '' : ' · 自动触发到期 F' + record.triggerFrame) + (record.effectFrame == null ? ' · 尚无已生效效果' : ' · 首次生效 F' + record.effectFrame)}>
            {width >= 14 && <span className="ml-0.5">{record.actionType}</span>}
          </div>
        })}
      </div>
    </div>
  )
}
