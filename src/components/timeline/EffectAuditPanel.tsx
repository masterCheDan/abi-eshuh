import { useMemo, useState } from 'react'
import type { EffectAuditRecord } from '../../engine/model/types'
import { useSimulationStore } from '../../stores/useSimulationStore'

function timeOf(frame: number): string {
  const seconds = Math.floor(frame / 30)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} F${frame % 30}`
}

function detailOf(record: EffectAuditRecord): string | undefined {
  if (record.effectType === 'CostDebt') {
    return record.action === 'consumed'
      ? '欠费已还清'
      : `欠费余额 -${(record.value ?? 0).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} Cost`
  }
  if (record.effectType === 'Special' && record.detail?.startsWith('CostOverload=')) {
    return `可欠费 ${record.value ?? 5} Cost${record.expiresAt == null ? '' : ` · 至 F${record.expiresAt}`}`
  }
  if (record.effectType === 'CardOrder' && record.detail) {
    return record.detail
      .replace('self_redraw', '重新抓取自身卡')
      .replace('fixed_sequence', '固定卡序列')
      .replace('rapid_fire', '连射牌序')
      .replace('timeout_to_tail', '超时移至牌序末尾')
      .replace('end_to_tail', '结束并移至牌序末尾')
      .replace('copy:used_and_reverted', '复制卡已使用并还原')
      .replace('copy_at', '复制生效帧')
      .replace('card_owner:ibuki:executor:toramaru', '卡牌归属：伊吹；执行主体：虎丸')
  }
  if (record.effectType !== 'CostChange' || record.value == null) return record.detail
  const value = record.valueType === 'Coefficient'
    ? `${record.value / 100}%`
    : `${record.value > 0 ? '+' : ''}${record.value} Cost`
  const uses = record.uses == null ? '' : ` · ${record.uses} 次`
  return `${value}${uses}`
}

/** 显示引擎已经应用、过期或消费的效果，便于核对用户的手动假设。 */
export function EffectAuditPanel() {
  const [open, setOpen] = useState(false)
  const result = useSimulationStore(s => s.result)
  const records = useMemo(() => result?.effectAudit ?? [], [result])

  return (
    <div className="ba-panel ba-cut-panel overflow-hidden shrink-0">
      <button className="w-full flex items-center justify-between px-3 py-1.5 text-left" onClick={() => setOpen(value => !value)}>
        <span className="ba-eyebrow">效果审计</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{records.length} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto border-t" style={{ borderColor: 'var(--border)' }}>
          {records.length === 0 ? <p className="px-3 py-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>暂无已生效的学生技能效果</p> : records.map((record, index) => {
            const detail = detailOf(record)
            return (
              <div key={`${record.frame}-${record.issuerId}-${index}`} className="px-3 py-1 border-b text-[10px]" style={{ borderColor: 'var(--border-light)' }}>
                <span className="font-mono mr-2" style={{ color: 'var(--accent)' }}>{timeOf(record.frame)}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{record.effectType} · {record.action}</span>
                <span className="ml-1 font-mono" style={{ color: 'var(--text-muted)' }}>→ {record.targetIds.map(id => id === -1 ? 'Boss' : `ID:${id}`).join(', ') || '—'}</span>
                {detail && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({detail})</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
