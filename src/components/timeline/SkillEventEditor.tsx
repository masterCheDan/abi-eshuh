import { useMemo, useState } from 'react'
import type { SkillBlock, StudentLane } from '../../types/timeline'
import type { ManualTriggerReason } from '../../engine/model/types'

const REASONS: { value: ManualTriggerReason; label: string }[] = [
  { value: 'chance', label: '概率生效' }, { value: 'random_target', label: '随机目标' }, { value: 'hp_threshold', label: '血量阈值' },
  { value: 'external_state', label: '外部状态' }, { value: 'action_event', label: '攻击/换弹事件' }, { value: 'interval', label: '周期确认' },
]

interface Props { lanes: StudentLane[]; skill: SkillBlock; onSave: (patch: Partial<SkillBlock>) => void; onClose: () => void }
/** 统一编辑器：所有手动事件在此维护多目标与用户确认事实。 */
export function SkillEventEditor({ lanes, skill, onSave, onClose }: Props) {
  const initialTargets = skill.targetIds ?? [skill.targetId ?? skill.studentId]
  const [targets, setTargets] = useState(new Set(initialTargets))
  const [reasons, setReasons] = useState<ManualTriggerReason[]>(skill.trigger?.reasons ?? [])
  const [endFrame, setEndFrame] = useState(skill.trigger?.conditionEndFrame?.toString() ?? '')
  const options = useMemo(() => [{ id: -1, name: 'Boss（敌方占位）' }, ...lanes.flatMap(lane => lane.student ? [{ id: lane.student.Id, name: lane.student.Name }] : [])], [lanes])
  const toggleTarget = (id: number) => setTargets(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleReason = (reason: ManualTriggerReason) => setReasons(prev => prev.includes(reason) ? prev.filter(value => value !== reason) : [...prev, reason])
  const save = () => {
    const targetIds = [...targets]
    onSave({ targetIds, targetId: targetIds[0] ?? skill.studentId, triggerSource: 'manual', trigger: { source: 'manual', reasons, conditionEndFrame: endFrame === '' ? undefined : Number(endFrame) } })
    onClose()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={onClose}>
    <div className="w-[360px] rounded-xl border p-4 shadow-2xl" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between mb-3"><b className="text-sm">编辑手动技能事件</b><button onClick={onClose}>✕</button></div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>用户选择目标</div>
      <div className="flex flex-wrap gap-1.5 mb-3">{options.map(option => <label key={option.id} className="text-[11px] px-2 py-1 rounded border cursor-pointer" style={{ borderColor: targets.has(option.id) ? 'var(--accent)' : 'var(--border)' }}><input className="mr-1" type="checkbox" checked={targets.has(option.id)} onChange={() => toggleTarget(option.id)} />{option.name}</label>)}</div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>用户确认的触发事实</div>
      <div className="flex flex-wrap gap-1.5 mb-3">{REASONS.map(reason => <label key={reason.value} className="text-[11px]"><input className="mr-1" type="checkbox" checked={reasons.includes(reason.value)} onChange={() => toggleReason(reason.value)} />{reason.label}</label>)}</div>
      <label className="block text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>条件失效帧（Duration=-1 时必填）<input className="ml-2 w-24 rounded border px-1" type="number" min={skill.startFrame} value={endFrame} onChange={event => setEndFrame(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="text-xs px-2 py-1">取消</button><button onClick={save} className="text-xs px-3 py-1 rounded text-white" style={{ background: 'var(--accent)' }}>保存</button></div>
    </div>
  </div>
}
