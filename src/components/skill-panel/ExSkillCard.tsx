import { useState, useMemo } from 'react'
import type { Student } from '../../types/student'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useSquadStore } from '../../stores/useSquadStore'
import { SkillIcon } from './SkillIcon'
import { useI18n } from '../../i18n'
import { computeCostTimeline, costAtFrame, COST_SCALE } from '../../utils/costCalc'

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
  const squadMode = useSquadStore((s) => s.config.mode)
  const ex = student.Skills.E

  // ── EX 等级 ──
  const slot = slots.find((s) => s.student?.Id === student.Id)
  const exLevel = slot?.exLevel ?? 5

  /** Cost 时间线（用于查询任意时点的 Cost） */
  const costTimeline = useMemo(() => computeCostTimeline(allLanes, squadMode), [allLanes, squadMode])

  /** 归一化 Target：字符串包裹为数组，undefined → [] */
function toArray(v: string | string[] | undefined): string[] {
    if (v === undefined) return []
    return typeof v === 'string' ? [v] : v
}

/* ── 技能分类 ── */
  type TargetMode = 'none' | 'self' | 'boss' | 'striker' | 'any'
  const { targetMode, hasTarget } = useMemo(() => {
    const effects = ex.Effects
    const types = effects.map((e) => e.Type)

    // 召唤类 → 无目标选择器
    if (types.includes('Summon')) return { targetMode: 'none' as TargetMode, hasTarget: false }

    // ── 收集所有显式 Target 值 ──
    const allExplicit: string[] = []
    for (const ef of effects) {
      for (const t of toArray(ef.Target)) {
        allExplicit.push(t)
      }
    }
    const hasExplicitSelf = allExplicit.includes('Self')
    const hasExplicitEnemy = allExplicit.includes('Enemy')
    const hasExplicitAny = allExplicit.includes('Any')
    const hasExplicitAlly = allExplicit.some(t =>
      ['Ally', 'AllyMain', 'AllySupport'].includes(t),
    )

    // 0) 空 Effects（纯形态切换）→ 自身，无目标选择器
    if (effects.length === 0) {
      return { targetMode: 'self' as TargetMode, hasTarget: false }
    }

    // 1) 全部显式 Target 均为 Self → 仅自身（无论效果类型）
    if (allExplicit.length > 0 && allExplicit.every((t) => t === 'Self')) {
      return { targetMode: 'self' as TargetMode, hasTarget: false }
    }

    // 2) 全部显式 Target 均为 Enemy → Boss
    if (allExplicit.length > 0 && allExplicit.every((t) => t === 'Enemy')) {
      return { targetMode: 'boss' as TargetMode, hasTarget: true }
    }

    // 3) Any 关键词 → 混合
    if (hasExplicitAny) {
      return { targetMode: 'any' as TargetMode, hasTarget: true }
    }

    // 4) Enemy + Ally 混合 → 混合
    if (hasExplicitEnemy && hasExplicitAlly) {
      return { targetMode: 'any' as TargetMode, hasTarget: true }
    }

    // 5) 仅友方目标（可能含 Self）→ STRIKER
    if (!hasExplicitEnemy && !hasExplicitAny && hasExplicitAlly) {
      return { targetMode: 'striker' as TargetMode, hasTarget: true }
    }

    // 6) 纯敌方目标 → Boss
    if (hasExplicitEnemy && !hasExplicitAlly && !hasExplicitSelf) {
      return { targetMode: 'boss' as TargetMode, hasTarget: true }
    }

    // ── 以下为「无显式 Target」或「Self + Enemy 混合」的回退逻辑 ──

    // 7) 纯伤害/Debuff/CC/Knockback → Boss
    const onlyOffensive = effects.every((ef) =>
      ef.Type === 'Damage' || ef.Type === 'CrowdControl' || ef.Type === 'Knockback' ||
      ef.Type === 'DamageDebuff' || ef.Type === 'Debuff' || ef.Type === 'Accumulation' ||
      ef.Type === 'ConcentratedTarget' ||
      (ef.Type === 'Buff' && toArray(ef.Target).includes('Enemy'))
    )
    if (onlyOffensive) return { targetMode: 'boss' as TargetMode, hasTarget: true }

    // 8) 纯友方 Buff/Heal/Shield/Regen/Dispel → STRIKER
    const onlyAllySupport = effects.every((ef) =>
      ef.Type === 'Buff' || ef.Type === 'Heal' || ef.Type === 'Shield' ||
      ef.Type === 'Regen' || ef.Type === 'Dispel' ||
      (ef.Type === 'Special' && toArray(ef.Target).includes('Ally'))
    )
    if (onlyAllySupport) return { targetMode: 'striker' as TargetMode, hasTarget: true }

    // 9) 兜底 → Boss
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
  const skillCost = ex.Cost[exLevel - 1] * COST_SCALE
  const availableCost = costAtFrame(costTimeline, totalFrames)
  const hasEnoughCost = availableCost >= skillCost

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
      studentId: student.Id, targetId: effectiveTargetId(),
      skillCost: ex.Cost[exLevel - 1], skillDuration: ex.Duration,
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
            COST {ex.Cost[exLevel - 1]}
          </span>
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
        <span style={{ color: 'var(--text-secondary)' }}>{totalFrames} 帧</span>
      </div>

      {/* 目标选择器 */}
      {hasTarget ? (
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
      ) : targetMode === 'self' ? (
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{t.skill.target}</span>
          <span className="font-game text-[11px] px-1.5 py-0.5 rounded" style={{ color: '#10b981', background: 'rgba(16,185,129,0.10)' }}>
            {t.skill.target_self}
          </span>
        </div>
      ) : null}

      {/* 底部操作栏 */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{ex.Duration}帧</span>
        {!isTimeValid && !isNaN(totalFrames) && (
          <span className="text-[11px] text-red-400">时间冲突</span>
        )}
        {isTimeValid && !hasEnoughCost && !isNaN(totalFrames) && (
          <span className="text-[11px] text-red-400">
            <span className="font-game">COST</span>不足 ({skillCost}/{availableCost.toFixed(1)})
          </span>
        )}
        <div className="flex-1" />
        <button
          draggable={selected}
          onDragStart={selected ? (e) => {
            e.dataTransfer.setData('application/x-skill-block', JSON.stringify({
              type: 'ex', name: ex.Name, startFrame: 0,
              studentId: student.Id, targetId: effectiveTargetId(),
            }))
            e.dataTransfer.effectAllowed = 'copyMove'
          } : undefined}
          className={`text-xs px-2 py-0.5 rounded border ${selected ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40'}`}
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
