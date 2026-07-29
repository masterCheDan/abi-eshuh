import { useMemo, useState } from 'react'
import { useSimulationStore } from '../../stores/useSimulationStore'

function timeOf(frame: number): string {
  const seconds = Math.floor(frame / 30)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} F${frame % 30}`
}

/** 显示引擎已经应用、过期或消费的效果，便于核对用户的手动假设。 */
export function EffectAuditPanel() {
  const [open, setOpen] = useState(false)
  const result = useSimulationStore(s => s.result)
  const records = useMemo(() => (result?.effectAudit ?? []).filter(record => record.action !== 'scheduled'), [result])

  return (
    <div className="ba-panel ba-cut-panel overflow-hidden shrink-0">
      <button className="w-full flex items-center justify-between px-3 py-1.5 text-left" onClick={() => setOpen(value => !value)}>
        <span className="ba-eyebrow">效果审计</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{records.length} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto border-t" style={{ borderColor: 'var(--border)' }}>
          {records.length === 0 ? <p className="px-3 py-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>暂无已生效的学生技能效果</p> : records.map((record, index) => (
            <div key={`${record.frame}-${record.issuerId}-${index}`} className="px-3 py-1 border-b text-[10px]" style={{ borderColor: 'var(--border-light)' }}>
              <span className="font-mono mr-2" style={{ color: 'var(--accent)' }}>{timeOf(record.frame)}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{record.effectType} · {record.action}</span>
              {record.detail && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({record.detail})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
