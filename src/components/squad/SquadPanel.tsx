import { useSquadStore } from '../../stores/useSquadStore'
import { SquadSlotComponent } from './SquadSlot'
import type { SquadMode } from '../../types/squad'
import { useI18n } from '../../i18n'

export function SquadPanel() {
  const { t } = useI18n()
  const mode = useSquadStore((s) => s.config.mode)
  const setMode = useSquadStore((s) => s.setMode)
  const slots = useSquadStore((s) => s.config.slots)

  const mainSlots = slots.filter((s) => s.slotType === 'Main')
  const supportSlots = slots.filter((s) => s.slotType === 'Support')

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-200">{t.squad.title}</h2>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SquadMode)}
          className="bg-gray-700 text-xs text-gray-300 rounded px-2 py-1 border border-gray-600"
        >
          <option value="normal">{t.squad.normal}</option>
          <option value="total_assault">{t.squad.total_assault}</option>
        </select>
      </div>

      <div className="mb-2">
        <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{t.squad.front}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {mainSlots.map((slot) => (
            <SquadSlotComponent key={slot.index} slotIndex={slot.index} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{t.squad.back}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {supportSlots.map((slot) => (
            <SquadSlotComponent key={slot.index} slotIndex={slot.index} />
          ))}
        </div>
      </div>
    </div>
  )
}
