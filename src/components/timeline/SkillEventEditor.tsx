import { useMemo, useState } from 'react'
import type { SkillBlock, StudentLane } from '../../types/timeline'
import type { ManualTriggerReason } from '../../engine'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { activeSummonsAtFrame, summonTargetLabel } from '../../engine'
import { resolveSkill } from '../../engine/system/SkillResolver'
import { requiredTriggerReasons } from '../../domain/triggerEvidence'

const REASONS: { value: ManualTriggerReason; label: string }[] = [
  { value: 'chance', label: '概率生效' }, { value: 'random_target', label: '随机目标' }, { value: 'hp_threshold', label: '血量阈值' },
  { value: 'external_state', label: '外部状态' }, { value: 'action_event', label: '攻击/换弹事件' }, { value: 'interval', label: '周期确认' },
]

interface Props { lanes: StudentLane[]; skill: SkillBlock; onSave: (patch: Partial<SkillBlock>) => void; onClose: () => void }
/** 统一编辑器：所有手动事件在此维护多目标与用户确认事实。 */
export function SkillEventEditor({ lanes, skill, onSave, onClose }: Props) {
  const initialTargets = skill.targetIds ?? [skill.targetId ?? skill.studentId]
  const [targets, setTargets] = useState<Set<number | string>>(new Set([...initialTargets, ...(skill.targetSummonIds ?? []), ...(skill.targetSummonRefs ?? []).map(ref => `summon-${ref.sourceEventId}-${ref.summonId}-${ref.spawnIndex}`)]))
  const simulation = useSimulationStore((state) => state.result)
  const [reasons, setReasons] = useState<ManualTriggerReason[]>(skill.trigger?.reasons ?? [])
  const [endFrame, setEndFrame] = useState(skill.trigger?.conditionEndFrame?.toString() ?? '')
  const [frame, setFrame] = useState(skill.startFrame)
  const [error, setError] = useState('')
  const options = useMemo(() => [
    { id: -1 as number | string, name: 'Boss（敌方占位）' },
    ...lanes.flatMap(lane => lane.student ? [{ id: lane.student.Id as number | string, name: lane.student.Name }] : []),
    ...activeSummonsAtFrame(simulation?.effectAudit, frame).map(summon => ({ id: summon.instanceId as number | string, name: summonTargetLabel(summon) })),
  ], [lanes, simulation?.effectAudit, frame])
  const toggleTarget = (id: number | string) => setTargets(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleReason = (reason: ManualTriggerReason) => setReasons(prev => prev.includes(reason) ? prev.filter(value => value !== reason) : [...prev, reason])
  const save = () => {
    if (!Number.isInteger(frame) || frame < 0) { setError('帧数必须是非负整数'); return }
    const student = lanes.find(lane => lane.studentId === skill.studentId)?.student
    const resolved = student ? resolveSkill(student, skill.skillRef ?? { kind: 'public' }) : null
    const required = requiredTriggerReasons(resolved?.effects ?? [], student?.Id, skill.skillRef ?? { kind: 'public' })
    if (required.some(reason => !reasons.includes(reason))) { setError(`请确认：${required.filter(reason => !reasons.includes(reason)).map(reason => REASONS.find(item => item.value === reason)?.label ?? reason).join('、')}`); return }
    if (endFrame !== '' && (!Number.isInteger(Number(endFrame)) || Number(endFrame) < frame)) { setError('条件结束帧不得早于触发帧'); return }
    const targetIds = [...targets].filter((target): target is number => typeof target === 'number')
    const targetSummonIds = [...targets].filter((target): target is string => typeof target === 'string')
    onSave({ startFrame: frame, targetIds, targetId: targetIds[0] ?? skill.studentId, targetSummonIds, targetSummonRefs: undefined, triggerSource: 'manual', trigger: { source: 'manual', reasons, conditionEndFrame: endFrame === '' ? undefined : Number(endFrame) } })
    onClose()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={onClose}>
    <div className="w-[360px] rounded-xl border p-4 shadow-2xl" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between mb-3"><b className="text-sm">编辑手动技能事件</b><button onClick={onClose}>✕</button></div>
      {skill.trigger?.source === 'automatic' && <p className="text-xs text-amber-300">此操作将转为人工确认，请勾选触发事实。</p>}
      <label className="block text-xs mb-3">触发帧<input aria-label="触发帧" className="ml-2 w-24" type="number" min={0} value={frame} onChange={event => setFrame(Number(event.target.value))} /></label>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>用户选择目标</div>
      <div className="flex flex-wrap gap-1.5 mb-3">{options.map(option => <label key={option.id} className="text-[11px] px-2 py-1 rounded border cursor-pointer" style={{ borderColor: targets.has(option.id) ? 'var(--accent)' : 'var(--border)' }}><input className="mr-1" type="checkbox" checked={targets.has(option.id)} onChange={() => toggleTarget(option.id)} />{option.name}</label>)}</div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>用户确认的触发事实</div>
      <div className="flex flex-wrap gap-1.5 mb-3">{REASONS.map(reason => <label key={reason.value} className="text-[11px]"><input className="mr-1" type="checkbox" checked={reasons.includes(reason.value)} onChange={() => toggleReason(reason.value)} />{reason.label}</label>)}</div>
      <label className="block text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>条件失效帧（Duration=-1 时必填）<input className="ml-2 w-24 rounded border px-1" type="number" min={skill.startFrame} value={endFrame} onChange={event => setEndFrame(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="text-xs px-2 py-1">取消</button><button onClick={save} className="text-xs px-3 py-1 rounded text-white" style={{ background: 'var(--accent)' }}>保存</button></div>
    </div>
  </div>
}
