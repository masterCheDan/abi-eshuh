import { useState } from 'react'
import type { StudentLane, NsSuggestion } from '../../types/timeline'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { SkillEventEditor } from './SkillEventEditor'

export function NsSuggestionTrack({ lane, pxPerFrame }: { lane: StudentLane; pxPerFrame: number }) {
  const suggestions = useTimelineStore(s => s.suggestions)
  const lanes = useTimelineStore(s => s.lanes)
  const [editing, setEditing] = useState<NsSuggestion | null>(null)
  const selected = suggestions.filter(s => s.slotIndex === lane.slotIndex && s.block.studentId === lane.studentId)
  if (!selected.length) return null
  return <div className="flex h-8 border-b" style={{ borderColor: 'var(--border)' }} aria-label="待确认 NS 建议">
    <button className="sticky left-0 z-10 w-20 shrink-0 border-r text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }} title="移除本行全部未确认建议" onClick={() => useTimelineStore.getState().replaceSuggestions(suggestions.filter(s => s.slotIndex !== lane.slotIndex))}>移除本行建议</button>
    <div className="relative flex-1">
      {selected.map(s => <button key={s.id} className="absolute top-1 whitespace-nowrap border border-dashed rounded px-2 py-0.5 text-xs" style={{ left: s.block.startFrame * pxPerFrame, color: 'var(--text-primary)', background: 'var(--bg-surface)', borderColor: 'var(--warn)' }} title={`F${s.block.startFrame} · ${s.block.name} · 待人工确认，不参与推演`} onClick={() => setEditing(s)}>待确认 NS</button>)}
    </div>
    {editing && <SkillEventEditor lanes={lanes} skill={editing.block} onClose={() => setEditing(null)} onSave={patch => { useTimelineStore.getState().confirmSuggestion(editing.id, patch); setEditing(null) }} />}
  </div>
}
