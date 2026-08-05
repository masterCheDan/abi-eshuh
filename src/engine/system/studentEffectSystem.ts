/** Deterministic student-effect runtime. External battle facts are never inferred. */
import type { SkillEffect, Student } from '../../types/student'
import type { BattleEnv, EffectAuditRecord, EffectLedgerEntry, Formation, Intent, SkillRef, StudentRuntimeState, SummonInstance } from '../model/types'
import { DISPEL_RULES, SPECIAL_RULES } from './ruleManifest'
import { normalizedEffectTargets, skillRequiresManualTarget } from './skillTargeting'
import { applyCostModifier, normalizeCostChangeValueType } from './costModifier'
import { applyCostOverloadRule } from './costOverloadRules'
import { summonDurationMs, summonRule } from './summonRules'

type EffectTargetId = number | string

interface ActiveEffect {
  id: number
  targetId: EffectTargetId
  sourceId: number
  skillRef: SkillRef
  effect: SkillEffect
  key: string
  expiresAt?: number
  uses: number
  stacks: number
  amount: number
}
interface PendingEffect {
  frame: number
  issuerId: number
  skillRef: SkillRef
  effectIndex: number
  effect: SkillEffect
  targetIds: EffectTargetId[]
  conditionEndFrame?: number
  skillLevel: number
  valueRow: number
  isTick?: boolean
}
interface PendingSummon {
  frame: number
  issuerId: number
  sourceEventId: string
  skillRef: SkillRef
  effectIndexes: number[]
  effects: SkillEffect[]
  valueRows: number[]
  skillLevel: number
}

export interface ResolvedSkill {
  ref: SkillRef
  name: string
  duration: number
  cost: number
  effects: SkillEffect[]
  action: 'EX' | 'NS' | 'SS'
  level: number
}
export interface SkillLevels { ex: number; ns: number; ss: number }

function effectAmount(effect: SkillEffect, level: number, valueRow: number): number {
  if (effect.Scale?.length) return effect.Scale[level - 1] ?? effect.Scale[effect.Scale.length - 1] ?? 0
  const values = effect.Value?.[valueRow] ?? effect.Value?.[0]
  return values?.[level - 1] ?? values?.[values.length - 1] ?? 0
}
function effectKey(effect: SkillEffect): string {
  return typeof effect.StackLabel === 'string' ? effect.StackLabel : effect.Key ?? effect.Stat ?? effect.Type
}
function durationToFrames(duration: number | undefined, endFrame: number | undefined, startFrame: number): number | undefined {
  if (duration == null) return undefined
  if (duration < 0) return endFrame == null ? undefined : Math.max(0, endFrame - startFrame)
  return Math.ceil(duration * 30 / 1000)
}
function configuredDuration(effect: SkillEffect, key: string): number | undefined {
  return effect.Duration ?? SPECIAL_RULES[key]?.durationMs
}
function levelInput(levels: number | SkillLevels | undefined): SkillLevels {
  return typeof levels === 'number' ? { ex: levels, ns: 10, ss: 10 } : levels ?? { ex: 5, ns: 10, ss: 10 }
}

export function resolveSkill(student: Student, ref: SkillRef, levels?: number | SkillLevels): ResolvedSkill | null {
  const level = levelInput(levels)
  if (ref.kind === 'ex') return {
    ref,
    name: student.Skills.E.Name,
    duration: student.Skills.E.Duration,
    cost: student.Skills.E.Cost[level.ex - 1] ?? 0,
    effects: applyCostOverloadRule(student.Id, ref, student.Skills.E.Effects),
    action: 'EX',
    level: level.ex,
  }
  if (ref.kind === 'public' || ref.kind === 'gear_public') {
    const skill = ref.kind === 'gear_public' ? student.Skills.G : student.Skills.P
    return skill ? { ref, name: skill.Name, duration: skill.Duration ?? 60, cost: 0, effects: skill.Effects, action: 'NS', level: level.ns } : null
  }
  if (ref.kind === 'passive' || ref.kind === 'weapon_passive') {
    const skill = ref.kind === 'passive' ? student.Skills.PS : student.Skills.WP
    return { ref, name: skill.Name, duration: 0, cost: 0, effects: skill.Effects, action: 'SS', level: level.ss }
  }
  if (ref.kind === 'extra_passive') return { ref, name: student.Skills.EP.Name, duration: 0, cost: 0, effects: student.Skills.EP.Effects, action: 'SS', level: level.ss }
  const extra = (student.Skills.E.ExtraSkills ?? []).find(s => ref.extraSkillId ? s.Id === ref.extraSkillId : s === student.Skills.E.ExtraSkills?.[ref.extraSkillIndex ?? 0])
  return extra ? { ref, name: extra.Name, duration: extra.Duration, cost: extra.Cost[level.ex - 1] ?? extra.Cost[0] ?? 0, effects: extra.Effects, action: 'EX', level: level.ex } : null
}

export class StudentEffectSystem {
  private readonly active: ActiveEffect[] = []
  private readonly pending: PendingEffect[] = []
  private readonly pendingSummons: PendingSummon[] = []
  private readonly summons: SummonInstance[] = []
  private readonly cycleCursor = new Map<string, number>()
  private nextId = 1
  readonly audit: EffectAuditRecord[] = []
  readonly ledger: EffectLedgerEntry[] = []
  private readonly students: Map<number, Student>
  private readonly formation: Formation
  private readonly env: BattleEnv
  constructor(students: Map<number, Student>, formation: Formation, env: BattleEnv) {
    this.students = students
    this.formation = formation
    this.env = env
  }

  schedule(intent: Intent, skill: ResolvedSkill, frame: number): void {
    const summonGroups = new Map<string, { effectIndexes: number[]; effects: SkillEffect[]; valueRows: number[] }>()
    for (const [effectIndex, effect] of skill.effects.entries()) {
      if (effect.Type === 'Summon') {
        // 保持对旧数据/测试用占位 Summon 的兼容：只有带 SummonId 的效果
        // 才能建立可寻址的召唤物实例；其余仍作为普通效果进入审计。
        if (effect.SummonId == null) {
          const targetIds = this.resolveTargets(effect, intent)
          this.pending.push({ frame: frame + (effect.ApplyFrame ?? 0), issuerId: intent.issuerId, skillRef: skill.ref, effectIndex, effect, targetIds, conditionEndFrame: intent.trigger?.conditionEndFrame, skillLevel: skill.level, valueRow: 0 })
          this.audit.push({ frame, issuerId: intent.issuerId, targetIds, skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'scheduled', detail: 'legacy summon without SummonId' })
          continue
        }
        const valueRow = this.resolveValueRow(intent.issuerId, skill.ref, effect)
        if (valueRow < 0) {
          this.audit.push({ frame, issuerId: intent.issuerId, targetIds: [], skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'rejected', detail: 'formation condition not met' })
          continue
        }
        const key = `${effect.SummonId ?? -1}:${effect.ApplyFrame ?? 0}`
        const group = summonGroups.get(key) ?? { effectIndexes: [], effects: [], valueRows: [] }
        group.effectIndexes.push(effectIndex)
        group.effects.push(effect)
        group.valueRows.push(valueRow)
        summonGroups.set(key, group)
        continue
      }
      const valueRow = this.resolveValueRow(intent.issuerId, skill.ref, effect)
      if (valueRow < 0) {
        this.audit.push({ frame, issuerId: intent.issuerId, targetIds: [], skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'rejected', detail: 'formation condition not met' })
        continue
      }
      const targetIds = this.resolveTargets(effect, intent)
      this.pending.push({ frame: frame + (effect.ApplyFrame ?? 0), issuerId: intent.issuerId, skillRef: skill.ref, effectIndex, effect, targetIds, conditionEndFrame: intent.trigger?.conditionEndFrame, skillLevel: skill.level, valueRow })
      const detail = `${intent.trigger?.source ?? intent.triggerSource ?? 'manual'}${intent.trigger?.reasons?.length ? `:${intent.trigger.reasons.join(',')}` : ''}`
      this.audit.push({ frame, issuerId: intent.issuerId, targetIds, skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'scheduled', detail })
    }
    const selectedCycles = new Map<string, number>()
    for (const group of summonGroups.values()) {
      const summonId = group.effects[0]?.SummonId
      if (summonId == null) continue
      const rule = summonRule(summonId)
      if (!rule.cycle) continue
      const cycleKey = `${intent.issuerId}:${rule.cycle.join(',')}`
      if (selectedCycles.has(cycleKey)) continue
      const cursor = this.cycleCursor.get(cycleKey) ?? 0
      selectedCycles.set(cycleKey, rule.cycle[cursor % rule.cycle.length] ?? summonId)
      this.cycleCursor.set(cycleKey, (cursor + 1) % rule.cycle.length)
    }
    for (const group of summonGroups.values()) {
      const effect = group.effects[0]
      const summonId = effect?.SummonId
      if (!effect || summonId == null) continue
      const rule = summonRule(summonId)
      if (rule.cycle) {
        const cycleKey = `${intent.issuerId}:${rule.cycle.join(',')}`
        if (selectedCycles.get(cycleKey) !== summonId) continue
      }
      this.pendingSummons.push({
        frame: frame + (effect.ApplyFrame ?? 0),
        issuerId: intent.issuerId,
        sourceEventId: intent.id,
        skillRef: skill.ref,
        effectIndexes: group.effectIndexes,
        effects: group.effects,
        valueRows: group.valueRows,
        skillLevel: skill.level,
      })
      for (const effectIndex of group.effectIndexes) {
        this.audit.push({ frame, issuerId: intent.issuerId, targetIds: [intent.issuerId], skillRef: skill.ref, effectIndex, effectType: 'Summon', action: 'scheduled', detail: `summon:${summonId}` })
      }
    }
  }

  advance(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const active = this.active[i]
      if (active?.expiresAt != null && active.expiresAt <= frame) this.removeActive(i, frame, runtimes, 'expired')
    }
    for (const summon of this.summons) {
      if (summon.active && summon.expiresAt != null && summon.expiresAt <= frame) this.removeSummon(summon, frame, runtimes, 'expired')
    }
    const due = this.pending.filter(item => item.frame <= frame)
    this.pending.splice(0, this.pending.length, ...this.pending.filter(item => item.frame > frame))
    for (const item of due) this.apply(item, frame, runtimes)
    const dueSummons = this.pendingSummons.filter(item => item.frame <= frame)
    this.pendingSummons.splice(0, this.pendingSummons.length, ...this.pendingSummons.filter(item => item.frame > frame))
    for (const item of dueSummons) this.createSummon(item, frame, runtimes)
  }

  snapshotSummons(): SummonInstance[] {
    return this.summons.filter(summon => summon.active).map(summon => ({ ...summon, stats: { ...summon.stats } }))
  }

  getEffectiveCost(studentId: number, baseCost: number): number {
    const active = this.active.findLast(a => a.targetId === studentId && a.effect.Type === 'CostChange')
    return applyCostModifier(baseCost, active ? {
      amount: active.amount,
      valueType: normalizeCostChangeValueType(active.effect.ValueType),
    } : null)
  }
  getCostBorrowLimit(studentId: number): number {
    return this.active
      .filter(active => active.targetId === studentId && active.effect.Type === 'Special' && active.key === 'CostOverload')
      .reduce((limit, active) => Math.max(limit, active.amount), 0)
  }
  recordCostDebt(studentId: number, skillRef: SkillRef, frame: number, balance: number): void {
    this.audit.push({
      frame,
      issuerId: studentId,
      targetIds: [studentId],
      skillRef,
      effectIndex: -1,
      effectType: 'CostDebt',
      action: 'applied',
      detail: `balance:${balance}`,
      value: Math.round(Math.max(0, -balance) * 1_000) / 1_000,
    })
  }
  recordCostDebtRepaid(studentId: number, skillRef: SkillRef, frame: number): void {
    this.audit.push({
      frame,
      issuerId: studentId,
      targetIds: [studentId],
      skillRef,
      effectIndex: -1,
      effectType: 'CostDebt',
      action: 'consumed',
      detail: 'repaid',
      value: 0,
    })
  }
  consumeCostModifiers(studentId: number, frame: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const active = this.active[i]
      if (!active || active.targetId !== studentId || active.effect.Type !== 'CostChange') continue
      active.uses--
      if (active.uses <= 0) {
        this.removeActive(i, frame, new Map(), 'consumed')
      } else {
        this.audit.push({
          frame,
          issuerId: active.sourceId,
          targetIds: [active.targetId],
          skillRef: active.skillRef,
          effectIndex: -1,
          effectType: active.effect.Type,
          action: 'used',
          detail: active.key,
          effectId: active.id,
          value: active.amount,
          valueType: normalizeCostChangeValueType(active.effect.ValueType),
          uses: active.uses,
          expiresAt: active.expiresAt,
        })
      }
    }
  }
  /**
   * 当前帧的 Cost 回复加成（叠加在引擎 baseRegen 之上）。
   * - RegenCost_Base：平面加值，每个受影响成员各计一次。
   * - RegenCost_Coefficient：1/10000 单位（如 costModifier），作用于全队回复力，
   *   按 (sourceId, key) 去重，避免全员目标 buff 被重复累加。
   */
  getRegenDelta(baseRegen: number): number {
    let flat = 0
    let coefficient = 0
    const seen = new Set<string>()
    for (const a of this.active) {
      if (a.effect.Type !== 'Buff') continue
      const stat = a.effect.Stat
      if (stat === 'RegenCost_Base') {
        flat += a.amount * a.stacks
      } else if (stat === 'RegenCost_Coefficient') {
        const key = `${a.sourceId}:${a.key}`
        if (seen.has(key)) continue
        seen.add(key)
        coefficient += a.amount * a.stacks
      }
    }
    return flat + (baseRegen + flat) * coefficient / 10000
  }

  validate(intent: Intent, skill: ResolvedSkill, runtimes: Map<number, StudentRuntimeState>, allowExtraEx = false): string | null {
    if (!this.students.has(intent.issuerId)) return 'unknown caster'
    const selectedTargets: EffectTargetId[] = [...intent.targetIds, ...(intent.targetSummonIds ?? [])]
    if (!selectedTargets.length && this.requiresManualTarget(skill)) return 'target is required'
    if (new Set(selectedTargets).size !== selectedTargets.length) return 'duplicate targets are not allowed'
    const hasCostOverload = skill.effects.some(effect => effect.Type === 'Special' && effect.Key === 'CostOverload')
    if (hasCostOverload && selectedTargets.length !== 1) return 'CostOverload requires exactly one target'
    for (const targetId of selectedTargets) {
      if (typeof targetId === 'string') {
        if (!this.summons.some(summon => summon.active && summon.instanceId === targetId)) return `summon target ${targetId} is not active`
        if (!this.allowsAllySelection(skill) || !this.requiresManualTarget(skill)) return 'summon target is not valid for this skill'
        if (hasCostOverload) return 'CostOverload target must be a STRIKER'
        continue
      }
      if (targetId !== -1 && ![...runtimes.values()].some(r => r.studentId === targetId)) return `target ${targetId} is not in formation`
      if (targetId === -1 && !this.allowsEnemy(skill)) return 'enemy target is not valid for this skill'
      if (targetId !== -1 && !this.allowsAllySelection(skill) && this.requiresManualTarget(skill)) return 'ally target is not valid for this skill'
      if (hasCostOverload && targetId !== -1 && this.students.get(targetId)?.SquadType !== 'Main') return 'CostOverload target must be a STRIKER'
    }
    const caster = [...runtimes.values()].find(r => r.studentId === intent.issuerId)
    if (!caster) return 'caster is not in formation'
    if (intent.trigger?.conditionEndFrame != null && intent.trigger.conditionEndFrame < intent.frame) return 'condition end frame precedes trigger'
    if (skill.effects.some(e => e.Duration != null && e.Duration < 0) && intent.trigger?.source === 'manual' && intent.trigger.conditionEndFrame == null) return 'conditional effect requires an end frame'
    if (skill.ref.kind === 'extra_ex' && !allowExtraEx && !this.hasFormChange(intent.issuerId)) return 'extra EX requires an active FormChange state'
    for (const effect of skill.effects) {
      const failure = effect.Condition ? this.validateCondition(effect.Condition, caster, selectedTargets, skill) : null
      if (failure) return failure
    }
    return null
  }

  private createSummon(pending: PendingSummon, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    const first = pending.effects[0]
    const summonId = first?.SummonId
    if (first == null || summonId == null) return
    const rule = summonRule(summonId)
    const affected = this.summons.filter(instance => instance.active)
    const replacement = rule.replaceScope === 'vehicle'
      ? affected.filter(instance => instance.kind === 'vehicle')
      : rule.replaceScope === 'owner'
        ? affected.filter(instance => instance.ownerId === pending.issuerId && instance.summonId === summonId)
        : []
    for (const instance of replacement) this.removeSummon(instance, frame, runtimes, 'replaced')

    const groupIds = rule.cycle ?? [summonId]
    const concurrent = this.summons.filter(instance => instance.active && instance.ownerId === pending.issuerId && groupIds.includes(instance.summonId))
    const requested = Math.max(1, rule.spawnCount?.(pending.skillRef) ?? 1)
    const capacity = rule.maxCount == null ? requested : Math.max(0, rule.maxCount - concurrent.length)
    if (capacity <= 0) {
      this.audit.push({
        frame,
        issuerId: pending.issuerId,
        targetIds: [pending.issuerId],
        skillRef: pending.skillRef,
        effectIndex: pending.effectIndexes[0] ?? -1,
        effectType: 'Summon',
        action: 'rejected',
        detail: `summon:${summonId}:max_count:${rule.maxCount}`,
      })
      return
    }
    const count = Math.min(requested, capacity)
    const stats = Object.fromEntries(pending.effects.map((effect, index) => [
      effect.Stat ?? `Summon:${summonId}`,
      effectAmount(effect, pending.skillLevel, pending.valueRows[index] ?? 0),
    ]))
    const duration = summonDurationMs(summonId, first.Duration)
    const expiresAt = duration == null ? undefined : frame + durationToFrames(duration, undefined, frame)!
    for (let index = 0; index < count; index++) {
      const spawnIndex = index
      const instanceId = `summon-${pending.sourceEventId}-${summonId}-${spawnIndex}`
      const instance: SummonInstance = {
        instanceId,
        summonId,
        kind: rule.kind,
        ownerId: pending.issuerId,
        sourceEventId: pending.sourceEventId,
        sourceSkillRef: pending.skillRef,
        spawnFrame: frame,
        spawnIndex,
        expiresAt,
        stats: { ...stats },
        active: true,
      }
      this.summons.push(instance)
      const runtime = [...runtimes.values()].find(value => value.studentId === pending.issuerId)
      if (runtime) runtime.summons[String(summonId)] = (runtime.summons[String(summonId)] ?? 0) + 1
      this.audit.push({
        frame,
        issuerId: pending.issuerId,
        targetIds: [pending.issuerId],
        skillRef: pending.skillRef,
        effectIndex: pending.effectIndexes[0] ?? -1,
        effectType: 'Summon',
        action: 'applied',
        detail: `${rule.kind}:${summonId}:${instance.instanceId}`,
        effectId: this.nextId++,
        value: count,
        expiresAt,
        summon: { instanceId: instance.instanceId, summonId, kind: instance.kind, ownerId: instance.ownerId, spawnFrame: instance.spawnFrame, spawnIndex, expiresAt: instance.expiresAt },
      })
    }
  }

  private removeSummon(instance: SummonInstance, frame: number, runtimes: Map<number, StudentRuntimeState>, action: 'expired' | 'replaced'): void {
    if (!instance.active) return
    instance.active = false
    const runtime = [...runtimes.values()].find(value => value.studentId === instance.ownerId)
    if (runtime) {
      const key = String(instance.summonId)
      const next = Math.max(0, (runtime.summons[key] ?? 1) - 1)
      if (next === 0) delete runtime.summons[key]
      else runtime.summons[key] = next
    }
    this.audit.push({
      frame,
      issuerId: instance.ownerId,
      targetIds: [instance.ownerId],
      skillRef: instance.sourceSkillRef,
      effectIndex: -1,
      effectType: 'Summon',
      action,
      detail: `${instance.kind}:${instance.summonId}:${instance.instanceId}`,
      expiresAt: instance.expiresAt,
      summon: { instanceId: instance.instanceId, summonId: instance.summonId, kind: instance.kind, ownerId: instance.ownerId, spawnFrame: instance.spawnFrame, spawnIndex: instance.spawnIndex, expiresAt: instance.expiresAt },
    })
  }

  private apply(pending: PendingEffect, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (const targetId of pending.targetIds) {
      const effect = pending.effect
      const runtime = [...runtimes.values()].find(r => r.studentId === targetId)
      const key = effectKey(effect)
      if (effect.Type === 'Dispel') { this.dispel(targetId, frame, runtimes, pending); continue }
      if (effect.Type === 'Special' && key === 'CostOverload' && !this.isFormationFull()) {
        this.audit.push({
          frame,
          issuerId: pending.issuerId,
          targetIds: [targetId],
          skillRef: pending.skillRef,
          effectIndex: pending.effectIndex,
          effectType: effect.Type,
          action: 'rejected',
          detail: 'CostOverload:requires_full_formation',
        })
        continue
      }
      if (['Damage', 'Heal', 'Regen', 'DamageDebuff'].includes(effect.Type)) {
        this.recordLedger(frame, pending, targetId, effect, effect.Type === 'DamageDebuff' || effect.Type === 'Regen' ? 'tick' : undefined)
        const duration = durationToFrames(configuredDuration(effect, key), pending.conditionEndFrame, frame)
        if ((effect.Type === 'Regen' || effect.Type === 'DamageDebuff') && effect.Period && duration && duration > 0) {
          for (let tick = frame + Math.ceil(effect.Period * 30 / 1000); tick <= frame + duration; tick += Math.ceil(effect.Period * 30 / 1000)) {
            this.pending.push({ ...pending, frame: tick, targetIds: [targetId], isTick: true, effect: { ...effect, Type: effect.Type === 'Regen' ? 'Regen' : 'DamageDebuff', Period: undefined, Duration: undefined } })
          }
        }
        this.audit.push({
          frame,
          issuerId: pending.issuerId,
          targetIds: [targetId],
          skillRef: pending.skillRef,
          effectIndex: pending.effectIndex,
          effectType: effect.Type,
          action: pending.isTick ? 'ticked' : 'applied',
          detail: key,
          stat: effect.Stat,
          value: effectAmount(effect, pending.skillLevel, pending.valueRow),
          expiresAt: duration == null ? undefined : frame + duration,
        })
        continue
      }
      const expiresAt = (() => { const duration = durationToFrames(configuredDuration(effect, key), pending.conditionEndFrame, frame); return duration == null ? undefined : frame + duration })()
      // All EX Cost reductions share one non-stacking channel in game data.
      const sameChannel = effect.Type === 'CostChange'
        ? this.active.find(a => a.targetId === targetId && a.effect.Type === 'CostChange')
        : effect.Channel == null
          ? undefined
          : this.active.find(a => a.targetId === targetId && a.effect.Channel === effect.Channel)
      if (sameChannel) this.removeActive(this.active.indexOf(sameChannel), frame, runtimes, 'replaced')
      const sameStack = effect.StackSame ? this.active.find(a => a.targetId === targetId && a.key === key && a.effect.Type === effect.Type) : undefined
      if (sameStack) {
        sameStack.stacks++
        sameStack.expiresAt = expiresAt ?? sameStack.expiresAt
        this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: `${key} x${sameStack.stacks}`, effectId: sameStack.id, stat: effect.Stat, value: sameStack.amount * sameStack.stacks, valueType: effect.Type === 'CostChange' ? normalizeCostChangeValueType(effect.ValueType) : undefined, uses: effect.Type === 'CostChange' ? sameStack.uses : undefined, expiresAt: sameStack.expiresAt })
        continue
      }
      const active: ActiveEffect = { id: this.nextId++, targetId, sourceId: pending.issuerId, skillRef: pending.skillRef, effect, key, expiresAt, uses: effect.Uses ?? (effect.Type === 'CostChange' ? 1 : Number.POSITIVE_INFINITY), stacks: 1, amount: effectAmount(effect, pending.skillLevel, pending.valueRow) }
      this.active.push(active)
      if (runtime) this.applyRuntimeEffect(runtime, active)
      this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: `${key}=${active.amount}`, effectId: active.id, stat: effect.Stat, value: active.amount, valueType: effect.Type === 'CostChange' ? normalizeCostChangeValueType(effect.ValueType) : undefined, uses: effect.Type === 'CostChange' ? active.uses : undefined, expiresAt })
    }
  }

  private applyRuntimeEffect(runtime: StudentRuntimeState, active: ActiveEffect): void {
    const { effect, key } = active
    if (effect.Type === 'CrowdControl' || effect.Type === 'Knockback') runtime.controlledUntil = Math.max(runtime.controlledUntil, active.expiresAt ?? runtime.controlledUntil)
    if (effect.Type === 'Shield') runtime.shield += Math.max(0, active.amount)
    if (effect.Type === 'Summon') runtime.summons[String(effect.SummonId ?? key)] = (runtime.summons[String(effect.SummonId ?? key)] ?? 0) + 1
    if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(effect.Type)) runtime.specialStacks[key] = (runtime.specialStacks[key] ?? 0) + 1
  }
  private removeActive(index: number, frame: number, runtimes: Map<number, StudentRuntimeState>, action: 'expired' | 'consumed' | 'replaced' | 'dispelled'): void {
    const active = this.active[index]
    if (!active) return
    const runtime = [...runtimes.values()].find(r => r.studentId === active.targetId)
    if (runtime) {
      if (active.effect.Type === 'Shield') runtime.shield = Math.max(0, runtime.shield - Math.max(0, active.amount))
      if (active.effect.Type === 'Summon') { const key = String(active.effect.SummonId ?? active.key); runtime.summons[key] = Math.max(0, (runtime.summons[key] ?? 1) - 1) }
      if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(active.effect.Type)) runtime.specialStacks[active.key] = Math.max(0, (runtime.specialStacks[active.key] ?? 1) - active.stacks)
    }
    this.active.splice(index, 1)
    this.audit.push({ frame, issuerId: active.sourceId, targetIds: [active.targetId], skillRef: active.skillRef, effectIndex: -1, effectType: active.effect.Type, action, detail: active.key, effectId: active.id, stat: active.effect.Stat, value: active.amount, valueType: active.effect.Type === 'CostChange' ? normalizeCostChangeValueType(active.effect.ValueType) : undefined, uses: active.effect.Type === 'CostChange' ? active.uses : undefined, expiresAt: active.expiresAt })
  }
  private dispel(targetId: EffectTargetId, frame: number, runtimes: Map<number, StudentRuntimeState>, pending: PendingEffect): void {
    const removable = new Set(DISPEL_RULES.default)
    for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i]?.targetId === targetId && removable.has(this.active[i]!.effect.Type)) this.removeActive(i, frame, runtimes, 'dispelled')
    this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: 'Dispel', action: 'applied' })
  }
  private recordLedger(frame: number, pending: PendingEffect, targetId: EffectTargetId, effect: SkillEffect, detail?: string): void {
    const type = effect.Type as EffectLedgerEntry['effectType']
    this.ledger.push({ frame, issuerId: pending.issuerId, targetId, skillRef: pending.skillRef, effectType: type, value: effectAmount(effect, pending.skillLevel, pending.valueRow), hits: effect.Hits?.length ?? 1, detail })
  }
  private resolveValueRow(issuerId: number, skillRef: SkillRef, effect: SkillEffect): number {
    if (skillRef.kind !== 'extra_passive' || (effect.Value?.length ?? 0) <= 1) return 0
    const formationStudents = this.formation.slots.flatMap(id => {
      const student = id == null ? undefined : this.students.get(id)
      return student ? [student] : []
    })
    if (issuerId === 10016) return formationStudents.some(student => student.Name.startsWith('桃井')) ? 1 : 0
    if (issuerId === 13011) return formationStudents.some(student => student.Name.startsWith('绿')) ? 1 : 0
    if (issuerId === 10017) return Math.min(3, Math.max(0, formationStudents.filter(student => student.School === 'RedWinter').length - 1))
    if (issuerId === 10048) {
      const count = formationStudents.filter(student => student.School === 'Arius').length
      return count < 2 ? -1 : Math.min(2, count - 2)
    }
    if (issuerId === 16009) {
      const count = formationStudents.filter(student => /^(满|泉奈|月咏)/.test(student.Name)).length
      return Math.min(3, Math.max(0, count - 1))
    }
    if (issuerId === 10126) {
      const count = formationStudents.filter(student => student.Id !== issuerId && student.SquadType === 'Main' && student.ArmorType === 'HeavyArmor').length
      return Math.min(3, count)
    }
    return 0
  }
  private resolveTargets(effect: SkillEffect, intent: Intent): EffectTargetId[] {
    const selected = new Set<EffectTargetId>(); const selectors = normalizedEffectTargets(effect)
    if (!selectors.length) {
      intent.targetIds.forEach(id => selected.add(id))
      intent.targetSummonIds?.forEach(id => selected.add(id))
    }
    for (const selector of selectors) {
      if (selector === 'Self') selected.add(intent.issuerId)
      else if (selector === 'Enemy') selected.add(-1)
      else if (selector === 'Any' || selector === 'Ally') {
        intent.targetIds.forEach(id => { if (selector === 'Any' || id !== -1) selected.add(id) })
        intent.targetSummonIds?.forEach(id => selected.add(id))
      }
      else if (selector === 'AllyMain' || selector === 'AllySupport') for (const id of this.formation.slots) { const student = id == null ? undefined : this.students.get(id); if (id != null && id !== intent.issuerId && student && (selector === 'AllyMain' ? student.SquadType === 'Main' : student.SquadType === 'Support')) selected.add(id) }
    }
    return [...selected]
  }
  private requiresManualTarget(skill: ResolvedSkill): boolean { return skillRequiresManualTarget(skill.effects) }
  private allowsEnemy(skill: ResolvedSkill): boolean { return skill.effects.some(effect => normalizedEffectTargets(effect).some(target => target === 'Enemy' || target === 'Any')) }
  private allowsAllySelection(skill: ResolvedSkill): boolean { return skill.effects.some(effect => normalizedEffectTargets(effect).some(target => target === 'Ally' || target === 'Any')) }
  private hasFormChange(studentId: number): boolean { return this.active.some(active => active.targetId === studentId && active.effect.Type === 'Special' && SPECIAL_RULES[active.key]?.unlocksExtraEx === true) }
  private isFormationFull(): boolean {
    const required = this.formation.mode === 'normal' ? 6 : 10
    return this.formation.slots.length >= required
      && this.formation.slots.slice(0, required).every(studentId => studentId != null)
  }
  private validateCondition(condition: unknown, runtime: StudentRuntimeState, targetIds: EffectTargetId[], skill: ResolvedSkill): string | null {
    if (!condition || typeof condition !== 'object') return null
    const c = condition as { Type?: string; Parameter?: string; Operand?: string; Value?: unknown }
    const within = (actual: number, value: unknown) => { const v = Array.isArray(value) ? value : [value, value]; return actual >= Number(v[0] ?? 0) && actual <= Number(v[1] ?? v[0] ?? Number.POSITIVE_INFINITY) }
    if (c.Type === 'BuffCount') return within(this.active.filter(a => a.targetId === runtime.studentId && a.key === (c.Parameter ?? '')).reduce((sum, a) => sum + a.stacks, 0), c.Value) ? null : `BuffCount ${c.Parameter ?? ''} not in range`
    if (c.Type === 'Special') { const exists = (runtime.specialStacks[c.Parameter ?? ''] ?? 0) > 0; return exists === (c.Value !== false) ? null : `Special ${c.Parameter ?? ''} condition not met` }
    if (c.Type === 'SkillLevel') return within(skill.level, c.Value) ? null : `SkillLevel ${skill.level} not in range`
    if (c.Type === 'TargetProp') {
      const id = targetIds.find((target): target is number => typeof target === 'number' && target !== -1); const source = id == null ? { ArmorType: this.env.armorType } : this.students.get(id)
      if (!source || !c.Parameter || !(c.Parameter in source)) return null
      const equal = source[c.Parameter as keyof typeof source] === c.Value
      return (c.Operand === 'NotEqual' ? !equal : equal) ? null : `TargetProp ${c.Parameter} condition not met`
    }
    return null
  }
}
