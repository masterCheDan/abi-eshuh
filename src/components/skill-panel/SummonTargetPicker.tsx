import type { SummonInstance } from '../../engine'
import { TargetPicker, type TargetOption } from './TargetPicker'
import { summonTargetLabel } from '../../engine'

interface Props {
  summons: SummonInstance[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/** 与学生目标分开的召唤物选择器，稳定引用运行时 instanceId。 */
export function SummonTargetPicker({ summons, selectedIds, onChange }: Props) {
  if (!summons.length) return null
  const options: TargetOption<string>[] = summons.map(summon => ({ id: summon.instanceId, label: summonTargetLabel(summon) }))
  return <TargetPicker<string> options={options} selectedIds={selectedIds} onChange={onChange} label="当前在场召唤物" />
}
