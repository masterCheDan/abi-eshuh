import { useState } from 'react'
import { useSquadStore } from '../../stores/useSquadStore'
import { setMode } from '../../stores/squadTimeline'
import { SquadSlotComponent } from './SquadSlot'
import type { SquadMode } from '../../types/squad'
import { useI18n } from '../../i18n'

export function SquadPanel() {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const mode = useSquadStore((s) => s.config.mode)
  const slots = useSquadStore((s) => s.config.slots)

  const mainSlots = slots.filter((s) => s.slotType === 'Main')
  const supportSlots = slots.filter((s) => s.slotType === 'Support')

  return (
    <div className="ba-panel ba-cut-panel p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h2 className="ba-eyebrow">{t.squad.title}</h2>
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SquadMode)}
          className="ba-cut-btn bg-gray-700 text-xs text-gray-300 px-2 py-1 border border-gray-600"
        >
          <option value="normal">{t.squad.normal}</option>
          <option value="total_assault">{t.squad.total_assault}</option>
        </select>
      </div>

      {!collapsed && (<>
      <div className="mb-2">
        <div className="mb-1">
          <span className="font-game text-sm tracking-widest" style={{ color: 'var(--accent-2)' }}>{t.squad.front}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {mainSlots.map((slot) => (
            <SquadSlotComponent key={slot.index} slotIndex={slot.index} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1">
          <span className="font-game text-sm tracking-widest" style={{ color: 'var(--accent)' }}>{t.squad.back}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {supportSlots.map((slot) => (
            <SquadSlotComponent key={slot.index} slotIndex={slot.index} />
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}
