/**
 * 学生技能效果运行时。
 *
 * 这里不推断概率、血量或随机目标；它只执行时间轴中已确认的事实，
 * 并把每一次效果应用记录为可供 UI 审计的事件。
 */

import type { SkillEffect, Student } from '../../types/student'
import type {
  EffectAuditRecord,
  Formation,
  Intent,
  SkillRef,
  StudentRuntimeState,
} from '../model/types'

interface ActiveEffect {
  targetId: number
  sourceId: number
  effect: SkillEffect
  key: string
  expiresAt?: number
  uses: number
}

interface PendingEffect {
  frame: number
  issuerId: number
  skillRef: SkillRef
  effectIndex: number
  effect: SkillEffect
  targetIds: number[]
}

export interface ResolvedSkill {
  ref: SkillRef
  name: string
  duration: number
  cost: number
  effects: SkillEffect[]
  action: 'EX' | 'NS' | 'SS'
}

function lastNumber(effect: SkillEffect): number {
  const scale = effect.Scale
  if (scale?.length) return scale[scale.length - 1] ?? 0
  const values = effect.Value
  if (values?.length) {
    const row = values[values.length - 1]
    return row?.[row.length - 1] ?? 0
  }
  return 0
}

function durationToFrames(duration: number | undefined): number | undefined {
  return duration == null ? undefined : Math.max(0, Math.ceil(duration * 30 / 1000))
}

function normalizeTargets(target: SkillEffect['Target']): string[] {
  return target == null ? [] : Array.isArray(target) ? target : [target]
}

export function resolveSkill(student: Student, ref: SkillRef, exLevel = 5): ResolvedSkill | null {
  if (ref.kind === 'ex') {
    return { ref, name: student.Skills.E.Name, duration: student.Skills.E.Duration, cost: student.Skills.E.Cost[exLevel - 1] ?? 0, effects: student.Skills.E.Effects, action: 'EX' }
  }
  if (ref.kind === 'public' || ref.kind === 'gear_public') {
    const skill = ref.kind === 'gear_public' ? student.Skills.G : student.Skills.P
    if (!skill) return null
    return { ref, name: skill.Name, duration: skill.Duration ?? 60, cost: 0, effects: skill.Effects, action: 'NS' }
  }
  if (ref.kind === 'passive' || ref.kind === 'weapon_passive') {
    const skill = ref.kind === 'passive' ? student.Skills.PS : student.Skills.WP
    return { ref, name: skill.Name, duration: 0, cost: 0, effects: skill.Effects, action: 'SS' }
  }
  if (ref.kind === 'extra_passive') {
    return { ref, name: student.Skills.EP.Name, duration: 0, cost: 0, effects: student.Skills.EP.Effects, action: 'SS' }
  }
  const extras = student.Skills.E.ExtraSkills ?? []
  const extra = ref.extraSkillId
    ? extras.find(s => s.Id === ref.extraSkillId)
    : extras[ref.extraSkillIndex ?? 0]
  if (!extra) return null
  return { ref, name: extra.Name, duration: extra.Duration, cost: extra.Cost[exLevel - 1] ?? extra.Cost[0] ?? 0, effects: extra.Effects, action: 'EX' }
}

/** 运行时的学生效果、减费与状态记录。 */
export class StudentEffectSystem {
  private readonly active: ActiveEffect[] = []
  private readonly pending: PendingEffect[] = []
  readonly audit: EffectAuditRecord[] = []
  private readonly students: Map<number, Student>
  private readonly formation: Formation

  constructor(students: Map<number, Student>, formation: Formation) {
    this.students = students
    this.formation = formation
  }

  schedule(intent: Intent, skill: ResolvedSkill, frame: number): void {
    skill.effects.forEach((effect, effectIndex) => {
      const targets = this.resolveTargets(effect, intent)
      const applyFrame = frame + (effect.ApplyFrame ?? 0)
      this.pending.push({ frame: applyFrame, issuerId: intent.issuerId, skillRef: skill.ref, effectIndex, effect, targetIds: targets })
      this.audit.push({ frame, issuerId: intent.issuerId, targetIds: targets, skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'scheduled' })
    })
  }

  /** 应在每帧自然回复之前调用，确保同帧生效效果影响该帧。 */
  advance(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const current = this.active[i]
      if (current && current.expiresAt != null && current.expiresAt <= frame) {
        this.audit.push({ frame, issuerId: current.sourceId, targetIds: [current.targetId], skillRef: { kind: 'extra_passive' }, effectIndex: -1, effectType: current.effect.Type, action: 'expired', detail: current.key })
        this.active.splice(i, 1)
      }
    }
    const due = this.pending.filter(p => p.frame <= frame)
    this.pending.splice(0, this.pending.length, ...this.pending.filter(p => p.frame > frame))
    for (const pending of due) this.apply(pending, frame, runtimes)
  }

  /** 下一次 EX 的费用修正；负数代表减费。 */
  getCostAdjustment(studentId: number): number {
    return this.active
      .filter(a => a.targetId === studentId && a.effect.Type === 'CostChange')
      .reduce((sum, a) => sum + lastNumber(a.effect), 0)
  }

  /** 只在 EX 真正施放后消费一次性减费效果。 */
  consumeCostModifiers(studentId: number, frame: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const current = this.active[i]
      if (!current || current.targetId !== studentId || current.effect.Type !== 'CostChange') continue
      current.uses--
      if (current.uses <= 0) {
        this.audit.push({ frame, issuerId: current.sourceId, targetIds: [studentId], skillRef: { kind: 'extra_passive' }, effectIndex: -1, effectType: 'CostChange', action: 'consumed', detail: current.key })
        this.active.splice(i, 1)
      }
    }
  }

  /** RegenCost_* 是唯一影响每帧 Cost 回复的学生效果。 */
  getRegenDelta(): number {
    return this.active
      .filter(a => a.effect.Type === 'Buff' && (a.effect.Stat === 'RegenCost_Base' || a.effect.Stat === 'RegenCost_Coefficient'))
      .reduce((sum, a) => sum + lastNumber(a.effect), 0)
  }

  validate(intent: Intent, skill: ResolvedSkill, runtimes: Map<number, StudentRuntimeState>): string | null {
    if (!this.students.has(intent.issuerId)) return 'unknown caster'
    for (const targetId of intent.targetIds) {
      if (targetId !== -1 && !this.students.has(targetId)) return `unknown target ${targetId}`
    }
    const runtime = [...runtimes.values()].find(r => r.studentId === intent.issuerId)
    if (!runtime) return 'caster is not in formation'
    for (const effect of skill.effects) {
      if (!effect.Condition) continue
      const message = this.validateCondition(effect.Condition, runtime, intent.targetIds)
      if (message) return message
    }
    return null
  }

  private apply(pending: PendingEffect, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    const effect = pending.effect
    const targets = pending.targetIds
    for (const targetId of targets) {
      if (targetId === -1) {
        this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: 'enemy-placeholder' })
        continue
      }
      const runtime = [...runtimes.values()].find(r => r.studentId === targetId)
      const key = effect.StackLabel ?? effect.Key ?? effect.Stat ?? effect.Type
      const duration = durationToFrames(effect.Duration)
      const existing = effect.Channel == null ? undefined : this.active.find(a => a.targetId === targetId && a.effect.Channel === effect.Channel)
      if (existing) this.active.splice(this.active.indexOf(existing), 1)

      if (effect.Type === 'CrowdControl' || effect.Type === 'Knockback') {
        if (runtime) runtime.controlledUntil = Math.max(runtime.controlledUntil, frame + (duration ?? 0))
      }
      if (effect.Type === 'Shield' && runtime) runtime.shield += Math.max(0, lastNumber(effect))
      if ((effect.Type === 'Special' || effect.Type === 'Accumulation' || effect.Type === 'ConcentratedTarget') && runtime) {
        runtime.specialStacks[key] = (runtime.specialStacks[key] ?? 0) + 1
      }
      if (effect.Type === 'Dispel') {
        for (let i = this.active.length - 1; i >= 0; i--) {
          const active = this.active[i]
          if (active?.targetId === targetId && active.effect.Type === 'Buff') this.active.splice(i, 1)
        }
      }
      if (effect.Type !== 'Damage' && effect.Type !== 'Heal' && effect.Type !== 'Regen' && effect.Type !== 'Dispel' && effect.Type !== 'CrowdControl' && effect.Type !== 'Knockback') {
        this.active.push({ targetId, sourceId: pending.issuerId, effect, key, expiresAt: duration == null ? undefined : frame + duration, uses: effect.Uses ?? (effect.Type === 'CostChange' ? 1 : Number.POSITIVE_INFINITY) })
      }
      this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: key })
    }
  }

  private resolveTargets(effect: SkillEffect, intent: Intent): number[] {
    const result = new Set<number>()
    const selectors = normalizeTargets(effect.Target)
    if (selectors.length === 0) for (const target of intent.targetIds) result.add(target)
    for (const selector of selectors) {
      if (selector === 'Self') result.add(intent.issuerId)
      else if (selector === 'Enemy') result.add(-1)
      else if (selector === 'AllyMain' || selector === 'AllySupport' || selector === 'Ally') {
        if (selector === 'Ally') for (const target of intent.targetIds) result.add(target)
        else for (const id of this.formation.slots) {
          const student = id == null ? undefined : this.students.get(id)
          if (student && id != null && (selector === 'AllyMain' ? student.SquadType === 'Main' : student.SquadType === 'Support')) result.add(id)
        }
      } else if (selector === 'Any') for (const target of intent.targetIds) result.add(target)
    }
    return [...result]
  }

  private validateCondition(condition: unknown, runtime: StudentRuntimeState, targetIds: number[]): string | null {
    if (!condition || typeof condition !== 'object') return null
    const c = condition as { Type?: string; Parameter?: string; Operand?: string; Value?: unknown }
    if (c.Type === 'BuffCount') {
      const values = Array.isArray(c.Value) ? c.Value : [0, Number.POSITIVE_INFINITY]
      const stacks = runtime.specialStacks[c.Parameter ?? ''] ?? 0
      const min = Number(values[0] ?? 0); const max = Number(values[1] ?? Number.POSITIVE_INFINITY)
      return stacks >= min && stacks <= max ? null : `BuffCount ${c.Parameter ?? ''} not in range`
    }
    if (c.Type === 'Special') {
      const exists = (runtime.specialStacks[c.Parameter ?? ''] ?? 0) > 0
      const wanted = c.Value !== false
      return exists === wanted ? null : `Special ${c.Parameter ?? ''} condition not met`
    }
    if (c.Type === 'TargetProp') {
      const target = targetIds.find(id => id !== -1)
      const student = target == null ? undefined : this.students.get(target)
      if (!student || !c.Parameter) return null // Boss/外部属性由用户事实决定
      const actual = student[c.Parameter as keyof Student]
      if (actual == null) return null
      const equal = actual === c.Value
      return (c.Operand === 'NotEqual' ? !equal : equal) ? null : `TargetProp ${c.Parameter} condition not met`
    }
    // SkillLevel 和外部战况条件在手动事件中已由用户确认；没有随机推断。
    return null
  }
}
