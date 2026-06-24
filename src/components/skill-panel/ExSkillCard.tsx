import { useState, useMemo } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { SkillIcon } from './SkillIcon'
import { useI18n } from '../../i18n'

interface ExSkillCardProps { student: Student }

export function ExSkillCard({ student }: ExSkillCardProps) {
  const { t } = useI18n()
  const [vMin, setMin] = useState('0')
  const [vSec, setSec] = useState('0')
  const [vFrame, setFrame] = useState('0')
  const [vMs, setMs] = useState('0')
  const [targetId, setTargetId] = useState<number | null>(null)
  const addSkillBlock = useTimelineStore((s) => s.addSkillBlock)
  const slots = useSquadStore((s) => s.config.slots)

  const slotIndex = useMemo(() => {
    const slot = slots.find((s) => s.student?.Id === student.Id)
    return slot?.index ?? -1
  }, [slots, student.Id])

  const squadStudents = useMemo(() => slots.filter((s) => s.student).map((s) => s.student!), [slots])
  const strikers = useMemo(() => squadStudents.filter((s) => s.SquadType === 'Main'), [squadStudents])
  const allLanes = useTimelineStore((s) => s.lanes)
  const ex = student.Skills.E

  /* ── 技能分类 ── */
  type TargetMode = 'none' | 'self' | 'boss' | 'striker' | 'any'
  const { targetMode, hasTarget } = useMemo(() => {
    const effects = ex.Effects
    const types = effects.map((e) => e.Type)

    // 召唤类 → 无目标选择器
    if (types.includes('Summon')) return { targetMode: 'none' as TargetMode, hasTarget: false }

    // 纯自身 Buff/Special（所有效果 Target 均为 Self 或 无 Target）→ 仅自身
    const allSelf = effects.every((ef) =>
      ef.Type === 'Summon' || (!ef.Target?.length) || ef.Target.every((t) => t === 'Self')
    )
    const onlyBuffOrSpecial = effects.every((ef) => ef.Type === 'Buff' || ef.Type === 'Special' || ef.Type === 'CostChange')
    if (allSelf && onlyBuffOrSpecial) return { targetMode: 'self' as TargetMode, hasTarget: true }

    // 纯伤害/Debuff/CC/Knockback → 仅 Boss
    const onlyOffensive = effects.every((ef) =>
      ef.Type === 'Damage' || ef.Type === 'CrowdControl' || ef.Type === 'Knockback' ||
      ef.Type === 'DamageDebuff' || ef.Type === 'Debuff' || ef.Type === 'Accumulation' ||
      ef.Type === 'ConcentratedTarget' ||
      (ef.Type === 'Buff' && ef.Target?.includes('Enemy'))
    )
    if (onlyOffensive) return { targetMode: 'boss' as TargetMode, hasTarget: true }

    // 纯友方 Buff/Heal/Shield/Regen/Heal → 仅 STRIKER
    const onlyAllySupport = effects.every((ef) =>
      ef.Type === 'Buff' || ef.Type === 'Heal' || ef.Type === 'Shield' ||
      ef.Type === 'Regen' || ef.Type === 'Dispel' ||
      (ef.Type === 'Special' && ef.Target?.includes('Ally'))
    )
    if (onlyAllySupport) return { targetMode: 'striker' as TargetMode, hasTarget: true }

    // 混合（Damage + Buff 等）→ Boss
    return { targetMode: 'boss' as TargetMode, hasTarget: true }
  }, [ex.Effects])

  // targetId: null=未选择, -1=Boss, other=学生ID
  const selected = !hasTarget || targetId !== null  // 无目标选择器时始终可选
  const effectiveTargetId = (): number => {
    if (!hasTarget) return student.Id   // 召唤类 → 自身
    if (targetMode === 'boss') return -1
    if (targetMode === 'self') return student.Id
    return targetId ?? student.Id
  }

  /* ── 工具：仅允许数字输入 ── */
  const digits = (v: string) => v.replace(/\D/g, '')
  const clamp = (v: string, lo: number, hi: number) => {
    const n = parseInt(v) || 0
    return String(Math.max(lo, Math.min(hi, n)))
  }

  /* ── 帧 → 毫秒 互推 ── */
  const syncMsFromParts = (mn: string, sc: string, fr: string) => {
    const tf = (parseInt(mn) || 0) * 1800 + (parseInt(sc) || 0) * 30 + (parseInt(fr) || 0)
    setMs(String(Math.round(Math.max(0, tf) * 1000 / 30)))
  }
  const applyMs = (ms: string) => {
    const n = parseInt(ms) || 0
    setMs(String(n))
    if (ms) {
      const tf = Math.round(n * 30 / 1000)
      const tsec = Math.floor(tf / 30)
      setMin(String(Math.floor(tsec / 60)))
      setSec(String(tsec % 60))
      setFrame(String(tf % 30))
    }
  }

  /* ── 安全值 ── */
  const min = parseInt(vMin) || 0
  const sec = Math.min(59, parseInt(vSec) || 0)
  const frame = Math.min(29, parseInt(vFrame) || 0)
  const msVal = parseInt(vMs) || 0
  const totalFrames = min * 1800 + sec * 30 + frame

  // ── 合法性检测：当前时间是否与已有技能冲突 ──
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

  const canAct = selected && isTimeValid

  const handleAdd = () => {
    if (!canAct) return
    addSkillBlock(slotIndex, {
      type: 'ex', name: ex.Name, startFrame: totalFrames,
      studentId: student.Id, targetId: effectiveTargetId(),
    })
  }

  return (
    <div className="rounded p-3 border" style={{ background: 'var(--bg-surface-alt)', borderColor: 'var(--border)' }}>
      {/* 头像 + 技能图标 + 技能名 · COST 右上 */}
      <div className="flex items-start gap-2.5 mb-3">
        <img src={`/icons/${student.Icon}.webp`} alt="" className="w-8 h-8 rounded-full shrink-0 bg-gray-700 mt-0.5" />
        <SkillIcon icon={ex.Icon} bulletType={student.BulletType} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ex.Name}</div>
        </div>
        <span className="font-game text-base shrink-0" style={{ color: 'var(--text-primary)' }}>
          COST {ex.Cost[0]}
        </span>
      </div>

      {/* 时间输入：一行 a m b s c ms / d f */}
      <div className="flex justify-center items-baseline gap-1 mb-1.5 flex-wrap text-sm font-mono">
        <input value={vMin}
          onChange={(e) => { const v = digits(e.target.value); setMin(v); syncMsFromParts(v, vSec, vFrame) }}
          onBlur={() => setMin((v) => { const c = clamp(v, 0, 5); syncMsFromParts(c, vSec, vFrame); return c })}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>m</span>

        <input value={vSec}
          onChange={(e) => { const v = digits(e.target.value); setSec(v); syncMsFromParts(vMin, v, vFrame) }}
          onBlur={() => setSec((v) => { const c = clamp(v, 0, 59); syncMsFromParts(vMin, c, vFrame); return c })}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>s</span>

        <input value={vMs}
          onChange={(e) => { const v = digits(e.target.value); applyMs(v) }}
          onBlur={() => setMs((v) => clamp(v, 0, 999))}
          className="w-10 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>ms</span>

        <span className="text-xs mx-0.5" style={{ color: 'var(--text-muted)' }}>/</span>

        <input value={vFrame}
          onChange={(e) => { const v = digits(e.target.value); setFrame(v); syncMsFromParts(vMin, vSec, v) }}
          onBlur={() => setFrame((v) => clamp(v, 0, 29))}
          className="w-8 text-center rounded px-0.5 py-0.5 border" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>f</span>
      </div>

      {/* 换算显示 */}
      <div className="mb-2 text-[11px] font-mono flex justify-center items-center gap-3">
        <span style={{ color: 'var(--text-secondary)' }}>
          {min}:{String(sec).padStart(2, '0')}.{String(msVal).padStart(3, '0')}
        </span>
        <span className="text-gray-500">=</span>
        <span style={{ color: 'var(--text-secondary)' }}>{totalFrames} 帧</span>
      </div>

      {/* 目标选择器 */}
      {hasTarget && (
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span>
          <select
            value={targetId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') { setTargetId(null); return }
              setTargetId(parseInt(v))
            }}
            className="rounded px-1.5 py-0.5 max-w-[110px] truncate border"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          >
            <option value="">{t.skill.target_none}</option>
            {targetMode === 'self' && (
              <option value={student.Id}>{t.skill.target_self}</option>
            )}
            {targetMode === 'boss' && (
              <option value={-1}>{t.event_log.target_boss}</option>
            )}
            {targetMode === 'striker' &&
              strikers.filter((s) => s.Id !== student.Id).map((s) => (
                <option key={s.Id} value={s.Id}>{s.Name}</option>
              ))
            }
          </select>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{ex.Duration}帧</span>
        {!isTimeValid && !isNaN(totalFrames) && (
          <span className="text-[10px] text-red-400">时间冲突</span>
        )}
        <div className="flex-1" />
        <button
          draggable={canAct}
          onDragStart={canAct ? (e) => {
            e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
              type: 'ex', name: ex.Name, startFrame: 0,
              studentId: student.Id, targetId: effectiveTargetId(),
            }))
            e.dataTransfer.effectAllowed = 'copyMove'
          } : undefined}
          className={`text-xs px-2 py-0.5 rounded border ${canAct ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40'}`}
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          ⠿ 拖拽
        </button>
        <button
          onClick={handleAdd}
          disabled={!canAct}
          className={`text-xs rounded px-3 py-1 font-medium ${canAct ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
        >
          + 添加
        </button>
      </div>
    </div>
  )
}
