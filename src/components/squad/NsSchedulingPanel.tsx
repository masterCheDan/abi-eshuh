import { useMemo, useState } from 'react'
import { rules } from '../../domain/rules/GameRules'
import { useNsSchedulingStore } from '../../stores/useNsSchedulingStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useTimelineStore } from '../../stores/useTimelineStore'

function hasNsFacts(lanes: ReturnType<typeof useTimelineStore.getState>['lanes'], slotIndex: number): boolean {
  const lane = lanes.find(value => value.slotIndex === slotIndex)
  return lane?.skills.some(skill => skill.type === 'ns' || skill.skillRef?.kind === 'public' || skill.skillRef?.kind === 'gear_public') ?? false
}

/** Explicit, per-student opt-in for the reviewed automatic NS scheduler. */
export function NsSchedulingPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const slots = useSquadStore(state => state.config.slots)
  const config = useNsSchedulingStore(state => state.config)
  const lanes = useTimelineStore(state => state.lanes)
  const setEnabled = useNsSchedulingStore(state => state.setEnabled)
  const setMode = useNsSchedulingStore(state => state.setMode)
  const rows = useMemo(() => slots.flatMap(slot => {
    if (!slot.student) return []
    const eligibility = rules.nsScheduling.eligibility(slot.student, slot.gearLevel)
    const facts = hasNsFacts(lanes, slot.index)
    const reasons = [...eligibility.reasons, ...(facts ? ['已录入 NS 事实；请先在时间轴删除或保留该事件，不能静默转换。'] : [])]
    return [{ slot, eligibility: { ...eligibility, eligible: eligibility.eligible && !facts }, reasons, facts }]
  }), [slots, lanes])

  return (
    <div className="ba-panel ba-cut-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCollapsed(value => !value)} className="flex items-center gap-2 text-left">
          <span className="text-[10px] w-4 text-center" style={{ color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
          <span className="ba-eyebrow">自动 NS</span>
        </button>
        <button type="button" role="switch" aria-checked={config.enabled} onClick={() => setEnabled(!config.enabled)}
          className="ba-cut-btn px-2 py-1 text-[10px]" style={{ background: config.enabled ? 'var(--accent-soft)' : 'var(--bg-surface-alt)', color: config.enabled ? 'var(--accent)' : 'var(--text-muted)' }}>
          {config.enabled ? '已开启' : '已关闭'}
        </button>
      </div>
      {!collapsed && <div className="mt-2 space-y-2 text-[10px]">
        <p style={{ color: 'var(--text-muted)' }}>仅逐技能审查通过的周期 NS 可自动施放。概率、攻击次数、随机目标及外部条件仍须人工确认。</p>
        {rows.length === 0 && <p style={{ color: 'var(--text-muted)' }}>配置学生后可在此检查自动资格。</p>}
        {rows.map(({ slot, eligibility, reasons }) => {
          const requested = config.nsModes[slot.index] ?? 'manual'
          return <div key={slot.index} className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-surface-alt)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={slot.student!.Name}>{slot.label} · {slot.student!.Name}</span>
              <select value={requested} disabled={!config.enabled} onChange={event => setMode(slot.index, event.target.value as 'manual' | 'automatic')}
                className="ba-cut-btn shrink-0 px-1 py-0.5 text-[10px]" style={{ background: 'var(--bg-app)', color: requested === 'automatic' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                <option value="manual">人工</option>
                <option value="automatic" disabled={!eligibility.eligible}>自动</option>
              </select>
            </div>
            {eligibility.eligible
              ? <p className="mt-1" style={{ color: 'var(--ok)' }}>可自动 · 每 {(eligibility.periodFrames ?? 0) / 30} 秒；延迟后从实际释放重新计时。</p>
              : <ul className="mt-1 space-y-0.5" style={{ color: 'var(--text-muted)' }}>{reasons.map(reason => <li key={reason}>· {reason}</li>)}</ul>}
            {config.enabled && requested === 'automatic' && !eligibility.eligible && <p className="mt-1" style={{ color: 'var(--danger)' }}>此选择不会生效，推演会保持人工模式。</p>}
          </div>
        })}
      </div>}
    </div>
  )
}
