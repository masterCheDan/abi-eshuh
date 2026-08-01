import { useState, useMemo } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { useSimulationStore } from '../../stores/useSimulationStore'
import { SkillIcon } from './SkillIcon'
import { useI18n } from '../../i18n'
import {
  canAffordSkillAtFrame,
  costBorrowLimitAtFrame,
  effectiveSkillCostAtFrame,
  COST_SCALE,
} from '../../utils/costCalc'
import { TargetPicker, type TargetOption } from './TargetPicker'
import { fixedSkillTargetIds, skillTargetPolicy } from '../../engine/system/skillTargeting'
import { applyCostOverloadRule, COST_OVERLOAD_RULES } from '../../engine/system/costOverloadRules'

interface ExSkillCardProps { student: Student }

export function ExSkillCard({ student }: ExSkillCardProps) {
  const { t } = useI18n()
  const [vMin, setMin] = useState('0')
  const [vSec, setSec] = useState('0')
  const [vFrame, setFrame] = useState('0')
  const [vMs, setMs] = useState('0')
  const [targetIds, setTargetIds] = useState<number[]>([])
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const slots = useSquadStore((s) => s.config.slots)

  const slot = useMemo(() => slots.find((s) => s.student?.Id === student.Id), [slots, student.Id])
  const slotIndex = slot?.index ?? -1

  const squadStudents = useMemo(() => slots.filter((s) => s.student).map((s) => s.student!), [slots])
  const allLanes = useTimelineStore((s) => s.lanes)
  const simulation = useSimulationStore((s) => s.result)
  const ex = student.Skills.E

  // ── EX 等级 ──
  const exLevel = slot?.exLevel ?? 5

  const targetPolicy = useMemo(
    () => skillTargetPolicy(applyCostOverloadRule(student.Id, { kind: 'ex' }, ex.Effects)),
    [ex.Effects, student.Id],
  )
  const isManualTarget = targetPolicy === 'select-ally' || targetPolicy === 'select-any'

  // targetId: null=未选择, -1=Boss, other=学生ID
  const selected = !isManualTarget || targetIds.length > 0
  const effectiveTargetIds = (): number[] => {
    return isManualTarget ? targetIds : fixedSkillTargetIds(targetPolicy, student.Id)
  }
  const targetOptions = useMemo<TargetOption[]>(() => {
    const candidates = COST_OVERLOAD_RULES[student.Id]
      ? squadStudents.filter(value => value.SquadType === 'Main')
      : squadStudents
    const allies = candidates.map(value => ({ id: value.Id, label: value.Name }))
    return targetPolicy === 'select-any' ? [{ id: -1, label: t.event_log.target_boss }, ...allies] : allies
  }, [squadStudents, student.Id, t.event_log.target_boss, targetPolicy])

  /* ── 工具：仅允许数字输入 ── */
  const digits = (v: string) => v.replace(/\D/g, '')
  const clamp = (v: string, lo: number, hi: number) => {
    const n = parseInt(v) || 0
    return String(Math.max(lo, Math.min(hi, n)))
  }

  /* ── 帧⇄毫秒 仅互推秒内部分 ── */
  const syncMsFromFrame = (fr: number) => {
    setMs(String(Math.round(Math.max(0, Math.min(29, fr)) * 1000 / 30)))
  }
  const syncFrameFromMs = (ms: number) => {
    const f = Math.round(Math.max(0, Math.min(999, ms)) * 30 / 1000)
    setFrame(String(Math.min(29, f)))
  }

  /* ── 安全值 ── */
  const min = parseInt(vMin) || 0
  const sec = Math.min(59, parseInt(vSec) || 0)
  const frame = Math.min(29, parseInt(vFrame) || 0)
  const msVal = Math.min(999, parseInt(vMs) || 0)
  const totalFrames = min * 1800 + sec * 30 + frame

  // ── Cost 充足性检测 ──
  const baseSkillCost = ex.Cost[exLevel - 1]
  const effectiveSkillCost = effectiveSkillCostAtFrame(simulation, student.Id, totalFrames, baseSkillCost)
  const skillCost = effectiveSkillCost * COST_SCALE
  const availableCost = simulation?.costHistory[Math.max(0, Math.min(totalFrames, simulation.maxFrame))] ?? 0
  const borrowLimit = costBorrowLimitAtFrame(simulation, student.Id, totalFrames)
  const hasEnoughCost = canAffordSkillAtFrame(simulation, student.Id, totalFrames, skillCost)
  const borrowedCost = hasEnoughCost ? Math.max(0, skillCost - availableCost) : 0
  const formatCost = (value: number) => (value / COST_SCALE).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')

  // ── 合法性检测：时间冲突 + Cost 充足 ──
  const isTimeValid = useMemo(() => {
    if (slotIndex < 0) return false
    const footprint = ex.Duration
    const ownSkills = allLanes.find(l => l.slotIndex === slotIndex)?.skills ?? []

    // 同学生冲突
    for (const s of ownSkills) {
      let dur = 60
      const st = allLanes.find(l => l.slotIndex === slotIndex)?.student
      if (st) {
        if (s.type === 'ex') dur = st.Skills.E.Duration
        else if (s.type === 'ns') { const p = st.HasGear ? st.Skills.G : st.Skills.P; dur = p.Duration || 60 }
      }
      if (totalFrames < s.startFrame + dur && totalFrames + footprint > s.startFrame) return false
    }

    // 全局 EX 帧唯一
    const exSet = new Set<number>()
    for (const l of allLanes) {
      if (l.slotIndex === slotIndex) continue
      for (const s of l.skills) { if (s.type === 'ex') exSet.add(s.startFrame) }
    }
    if (exSet.has(totalFrames)) return false

    return true
  }, [totalFrames, ex.Duration, slotIndex, allLanes])

  const canAct = selected && isTimeValid && hasEnoughCost

  const handleAdd = () => {
    if (!canAct) return
    addSkillBlock(slotIndex, {
      type: 'ex', name: ex.Name, startFrame: totalFrames,
      studentId: student.Id, targetId: effectiveTargetIds()[0] ?? student.Id, targetIds: effectiveTargetIds(),
      skillRef: { kind: 'ex' }, triggerSource: 'manual',
      skillCost: baseSkillCost, skillDuration: ex.Duration,
    })
  }

  return (
    <div className="rounded p-3 border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
      {/* 技能图标 + 技能名 · COST 右上 */}
      <div className="flex items-start gap-2.5 mb-3">
        <SkillIcon icon={ex.Icon} bulletType={student.BulletType} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ex.Name}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-game text-base" style={{ color: 'var(--text-primary)' }}>
            COST {baseSkillCost}
          </span>
          {effectiveSkillCost !== baseSkillCost && (
            <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-xs font-game text-cyan-300">
              → {effectiveSkillCost}
            </span>
          )}
          <select
            value={exLevel}
            onChange={(e) => useSquadStore.getState().setSkillLevel(slotIndex, 'ex', Number(e.target.value))}
            className="text-[10px] px-1 py-0.5 rounded border"
            style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>Lv.{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 时间输入：一行 a m b s c ms / d f */}
      <div className="flex justify-center items-baseline gap-1 mb-1.5 flex-wrap text-sm font-mono">
        <input value={vMin}
          onChange={(e) => setMin(digits(e.target.value))}
          onBlur={() => setMin((v) => clamp(v, 0, 5))}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs font-game" style={{ color: 'var(--text-muted)' }}>m</span>

        <input value={vSec}
          onChange={(e) => setSec(digits(e.target.value))}
          onBlur={() => setSec((v) => clamp(v, 0, 59))}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs font-game" style={{ color: 'var(--text-muted)' }}>s</span>

        <input value={vMs}
          onChange={(e) => { const v = digits(e.target.value); setMs(v); syncFrameFromMs(parseInt(v) || 0) }}
          onBlur={() => setMs((v) => clamp(v, 0, 999))}
          className="w-10 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs font-game" style={{ color: 'var(--text-muted)' }}>ms</span>

        <span className="text-xs mx-0.5" style={{ color: 'var(--text-muted)' }}>/</span>

        <input value={vFrame}
          onChange={(e) => { const v = digits(e.target.value); setFrame(v); syncMsFromFrame(parseInt(v) || 0) }}
          onBlur={() => setFrame((v) => clamp(v, 0, 29))}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs font-game" style={{ color: 'var(--text-muted)' }}>f</span>
      </div>

      {/* 换算显示 */}
      <div className="mb-2 text-xs font-mono flex justify-center items-center gap-3">
        <span style={{ color: 'var(--text-secondary)' }}>
          {min}:{String(sec).padStart(2, '0')}.{String(msVal).padStart(3, '0')}
        </span>
        <span className="text-gray-500">=</span>
        <span style={{ color: 'var(--text-secondary)' }}>{totalFrames} {t.skill.frame}</span>
      </div>

      {/* 目标选择器 */}
      {isManualTarget ? <TargetPicker options={targetOptions} selectedIds={targetIds} onChange={setTargetIds} label={t.skill.target} multiple={!COST_OVERLOAD_RULES[student.Id]} /> : (
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span>
          <span className="font-game text-[11px] px-1.5 py-0.5 rounded" style={{ color: targetPolicy === 'boss' ? '#fff' : 'var(--ok)', background: targetPolicy === 'boss' ? 'var(--danger)' : 'color-mix(in srgb, var(--ok) 10%, transparent)' }}>
            {targetPolicy === 'self' ? t.skill.target_self : targetPolicy === 'boss' ? t.event_log.target_boss : targetPolicy === 'mixed' ? `${t.skill.target_self} / ${t.event_log.target_boss}` : '固定编队范围'}
          </span>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{ex.Duration} {t.skill.frame}</span>
        {!isTimeValid && !isNaN(totalFrames) && (
          <span className="text-[11px] text-red-400">{t.skill.time_conflict}</span>
        )}
        {isTimeValid && !hasEnoughCost && !isNaN(totalFrames) && (
          <span className="text-[11px] text-red-400">
            {t.skill.cost_insufficient} ({formatCost(skillCost)}/{formatCost(availableCost)} COST)
          </span>
        )}
        {isTimeValid && borrowedCost > 0 && (
          <span className="text-[11px] text-amber-300">
            {t.skill.cost_overload} ({formatCost(borrowedCost)}/{borrowLimit} COST)
          </span>
        )}
        <div className="flex-1" />
        <button
          draggable={selected}
          onDragStart={selected ? (e) => {
            e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
              type: 'ex', name: ex.Name, startFrame: 0,
              studentId: student.Id, targetId: effectiveTargetIds()[0] ?? student.Id, targetIds: effectiveTargetIds(),
              skillRef: { kind: 'ex' }, triggerSource: 'manual',
            }))
            e.dataTransfer.effectAllowed = 'copyMove'
          } : undefined}
          className={`text-xs px-2 py-0.5 rounded border ${selected ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40'}`}
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          {t.skill.drag}
        </button>
        <button
          onClick={handleAdd}
          disabled={!canAct}
          className={`text-xs rounded px-3 py-1 font-medium ${canAct ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
        >
          {t.skill.add}
        </button>
      </div>
    </div>
  )
}
