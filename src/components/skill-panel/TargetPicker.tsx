export interface TargetOption<T extends string | number = number> { id: T; label: string }

interface TargetPickerProps<T extends string | number> {
  options: TargetOption<T>[]
  selectedIds: T[]
  onChange: (ids: T[]) => void
  label?: string
  multiple?: boolean
}

/** 可点击的多目标选择器；无需 Ctrl/Shift，适合时间轴排轴操作。 */
export function TargetPicker<T extends string | number>({ options, selectedIds, onChange, label = '目标', multiple = true }: TargetPickerProps<T>) {
  const selected = new Set(selectedIds)
  const toggle = (id: T) => {
    if (!multiple) {
      onChange(selected.has(id) ? [] : [id])
      return
    }
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(options.filter(option => next.has(option.id)).map(option => option.id))
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}{multiple ? ' · 可多选' : ''}</span>
        <div className="flex gap-1">
          {multiple && <button type="button" onClick={() => onChange(options.map(option => option.id))} className="text-[9px] px-1.5 py-0.5 rounded border hover:brightness-125" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>全选</button>}
          <button type="button" onClick={() => onChange([])} className="text-[9px] px-1.5 py-0.5 rounded border hover:brightness-125" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>清空</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => {
          const active = selected.has(option.id)
          return <button key={option.id} type="button" aria-pressed={active} onClick={() => toggle(option.id)} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-all hover:brightness-125" style={{ color: active ? '#fff' : 'var(--text-secondary)', background: active ? 'var(--accent)' : 'var(--bg-surface)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}>
            <span className="w-3 text-center">{active ? '✓' : '+'}</span>{option.label}
          </button>
        })}
      </div>
    </div>
  )
}
