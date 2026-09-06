/**
 * EffectExecutor：负责“生效以后改变什么”——到期、应用、召唤物生命周期、
 * Buff 覆盖/叠层、Cost 相关查询等全部运行期效果操作。
 */
import type { Student, SkillEffect } from '../../types/student'
import type { EffectAuditRecord, EffectLedgerEntry, Formation, SkillRef, StudentRuntimeState, SummonInstance } from '../model/types'
import { rules } from '../../domain/rules/GameRules'
import type { DynamicDamageRule } from '../../domain/rules/GameRules'
import { applyCostModifier, normalizeCostChangeValueType } from './costModifier'
import {
  configuredDuration,
  durationToFrames,
  effectAmount,
  effectKey,
  type ActiveEffect,
  type EffectRuntimeState,
  type EffectTargetId,
  type PendingEffect,
  type PendingSummon,
} from './effectRuntime'

export class EffectExecutor {
  /** Actual runtime functions, checked against the shared policy catalog. */
  static ruleBindings() {
    return {
      'effect.active': this.prototype.apply,
      'effect.ledger': this.prototype.recordLedger,
      'effect.dispel': this.prototype.dispel,
      'effect.summon': this.prototype.createSummon,
      'special.state': this.prototype.applyRuntimeEffect,
      'special.costDebt': this.prototype.getCostBorrowLimit,
      'special.layers': this.prototype.onLayersGained,
      'stat.active': this.prototype.apply,
      'stat.costRegen': this.prototype.getRegenDelta,
      'trigger.linked': this.prototype.maybeApplySelfExBuffSs,
    }
  }
  protected readonly active: ActiveEffect[]
  protected readonly pending: PendingEffect[]
  protected readonly pendingSummons: PendingSummon[]
  protected readonly summons: SummonInstance[]
  protected readonly cycleCursor: Map<string, number>
  readonly audit: EffectAuditRecord[]
  readonly ledger: EffectLedgerEntry[]
  protected readonly students: Map<number, Student>
  protected readonly formation: Formation
  protected readonly state: EffectRuntimeState

  constructor(
    state: EffectRuntimeState,
    students: Map<number, Student>,
    formation: Formation,
  ) {
    this.state = state
    this.active = state.active
    this.pending = state.pending
    this.pendingSummons = state.pendingSummons
    this.summons = state.summons
    this.cycleCursor = state.cycleCursor
    this.audit = state.audit
    this.ledger = state.ledger
    this.students = students
    this.formation = formation
  }

  advance(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    this.advanceLayerDecay(frame, runtimes)
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

  createSummon(pending: PendingSummon, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    if (this.state.onBeforeApply?.(pending) === false) return
    const offset = this.audit.length
    this.applySummon(pending, frame, runtimes)
    this.notifyApplied(pending, offset)
  }

  private applySummon(pending: PendingSummon, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    const first = pending.effects[0]
    const summonId = first?.SummonId
    if (first == null || summonId == null) return
    const rule = rules.summon.rule(summonId)
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
    const duration = rules.summon.durationMs(summonId, first.Duration)
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
        effectId: this.state.nextId++,
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

  apply(pending: PendingEffect, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    if (this.state.onBeforeApply?.(pending) === false) return
    const offset = this.audit.length
    this.applyEffect(pending, frame, runtimes)
    this.notifyApplied(pending, offset)
    this.state.onControlChanged?.(frame)
  }

  private notifyApplied(pending: PendingEffect | PendingSummon, offset: number): void {
    for (let index = offset; index < this.audit.length; index++) {
      const audit = this.audit[index]
      if (audit.issuerId !== pending.issuerId || audit.skillRef !== pending.skillRef) continue
      if (pending.actionId != null) audit.actionId = pending.actionId
      if (audit.action === 'applied' || audit.action === 'ticked') this.state.onApplied?.(audit)
    }
  }

  private applyEffect(pending: PendingEffect, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (const targetId of pending.targetIds) {
      const effect = pending.effect
      const handler = rules.skill.effectPolicy(effect.Type)?.handler
      const runtime = [...runtimes.values()].find(r => r.studentId === targetId)
      const key = effectKey(effect)
      const valueRow = pending.valueRowByTarget?.get(targetId) ?? pending.valueRow
      if (handler === 'effect.dispel') { this.dispel(targetId, frame, runtimes, pending); continue }
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
      if (handler === 'effect.ledger') {
        const value = this.damageValue(pending, targetId, runtimes)
        this.recordLedger(frame, pending, targetId, effect, value, effect.Type === 'DamageDebuff' || effect.Type === 'Regen' ? 'tick' : undefined)
        const duration = durationToFrames(configuredDuration(effect, key), pending.conditionEndFrame, frame)
        if ((effect.Type === 'Regen' || effect.Type === 'DamageDebuff') && effect.Period && duration && duration > 0) {
          for (let tick = frame + Math.ceil(effect.Period * 30 / 1000); tick <= frame + duration; tick += Math.ceil(effect.Period * 30 / 1000)) {
            this.pending.push({ ...pending, frame: tick, targetIds: [targetId], valueRowByTarget: pending.valueRowByTarget ? new Map([[targetId, valueRow]]) : undefined, isTick: true, effect: { ...effect, Type: effect.Type === 'Regen' ? 'Regen' : 'DamageDebuff', Period: undefined, Duration: undefined } })
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
          value,
          expiresAt: duration == null ? undefined : frame + duration,
        })
        continue
      }
      // 无固定 Duration 但用户确认了条件失效帧（如“持续至条件失效”的 SS 事实）：
      // 直接以 conditionEndFrame 作为自然结束帧，避免 Buff 永久残留。
      const expiresAt = (() => {
        const duration = durationToFrames(configuredDuration(effect, key), pending.conditionEndFrame, frame)
        if (duration != null) return frame + duration
        return pending.conditionEndFrame
      })()
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
        const runtime = [...runtimes.values()].find(r => r.studentId === targetId)
        if (runtime && ['Special', 'Accumulation', 'ConcentratedTarget'].includes(effect.Type)) {
          const layers = this.layerGain(sameStack)
          runtime.specialStacks[key] = this.applyLayerCap(sameStack.sourceId, key, (runtime.specialStacks[key] ?? 0) + layers)
          this.onLayersGained(sameStack.sourceId, key, layers, frame, runtimes)
        }
        this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: `${key} x${sameStack.stacks}`, effectId: sameStack.id, stat: effect.Stat, value: sameStack.amount * sameStack.stacks, valueType: effect.Type === 'CostChange' ? normalizeCostChangeValueType(effect.ValueType) : undefined, uses: effect.Type === 'CostChange' ? sameStack.uses : undefined, expiresAt: sameStack.expiresAt })
        continue
      }
      const active: ActiveEffect = { id: this.state.nextId++, targetId, sourceId: pending.issuerId, skillRef: pending.skillRef, effect, key, expiresAt, uses: effect.Uses ?? (effect.Type === 'CostChange' ? 1 : Number.POSITIVE_INFINITY), stacks: 1, amount: effectAmount(effect, pending.skillLevel, valueRow) }
      this.active.push(active)
      if (runtime) this.applyRuntimeEffect(runtime, active, frame, runtimes)
      this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: effect.Type, action: 'applied', detail: `${key}=${active.amount}`, effectId: active.id, stat: effect.Stat, value: active.amount, valueType: effect.Type === 'CostChange' ? normalizeCostChangeValueType(effect.ValueType) : undefined, uses: effect.Type === 'CostChange' ? active.uses : undefined, expiresAt })
      if (effect.Type === 'Buff' && pending.skillRef.kind === 'ex' && targetId === pending.issuerId && expiresAt != null) {
        this.maybeApplySelfExBuffSs(pending.issuerId, frame, expiresAt, runtimes)
      }
    }
  }

  /** 自身 EX Buff 生效时，为清单内学生同步施加对应 EP 增益（同帧失效）。 */
  private maybeApplySelfExBuffSs(issuerId: number, frame: number, expiresAt: number, runtimes: Map<number, StudentRuntimeState>): void {
    if (!rules.skill.selfExBuffEpIds.has(issuerId)) return
    const ep = this.students.get(issuerId)?.Skills.EP
    if (!ep) return
    const already = this.active.some(active =>
      active.targetId === issuerId
      && active.sourceId === issuerId
      && active.skillRef.kind === 'extra_passive'
      && active.expiresAt === expiresAt)
    if (already) return
    const slot = this.formation.slots.indexOf(issuerId)
    const ssLevel = this.formation.passiveSkillLevels?.[slot] ?? 10
    for (const effect of ep.Effects) {
      const key = effectKey(effect)
      const amount = effectAmount(effect, ssLevel, 0)
      const sameChannel = effect.Channel == null ? undefined : this.active.find(active => active.targetId === issuerId && active.effect.Channel === effect.Channel)
      if (sameChannel) this.removeActive(this.active.indexOf(sameChannel), frame, runtimes, 'replaced')
      const sameStack = effect.StackSame ? this.active.find(active => active.targetId === issuerId && active.key === key && active.effect.Type === effect.Type) : undefined
      if (sameStack) {
        sameStack.stacks++
        sameStack.expiresAt = expiresAt
        this.audit.push({ frame, issuerId, targetIds: [issuerId], skillRef: { kind: 'extra_passive' }, effectIndex: -1, effectType: effect.Type, action: 'applied', detail: `auto:self_ex_ss:${key} x${sameStack.stacks}`, effectId: sameStack.id, stat: effect.Stat, value: sameStack.amount * sameStack.stacks, expiresAt })
        continue
      }
      const active: ActiveEffect = { id: this.state.nextId++, targetId: issuerId, sourceId: issuerId, skillRef: { kind: 'extra_passive' }, effect, key, expiresAt, uses: Number.POSITIVE_INFINITY, stacks: 1, amount }
      this.active.push(active)
      const runtime = [...runtimes.values()].find(runtime => runtime.studentId === issuerId)
      if (runtime) this.applyRuntimeEffect(runtime, active, frame, runtimes)
      this.audit.push({ frame, issuerId, targetIds: [issuerId], skillRef: { kind: 'extra_passive' }, effectIndex: -1, effectType: effect.Type, action: 'applied', detail: `auto:self_ex_ss:${key}=${amount}`, effectId: active.id, stat: effect.Stat, value: amount, expiresAt })
    }
  }

  private applyRuntimeEffect(runtime: StudentRuntimeState, active: ActiveEffect, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    const { effect, key } = active
    if (effect.Type === 'CrowdControl' || effect.Type === 'Knockback') runtime.controlledUntil = Math.max(runtime.controlledUntil, active.expiresAt ?? Infinity)
    if (effect.Type === 'Shield') runtime.shield += Math.max(0, active.amount)
    if (effect.Type === 'Summon') runtime.summons[String(effect.SummonId ?? key)] = (runtime.summons[String(effect.SummonId ?? key)] ?? 0) + 1
    if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(effect.Type)) {
      const layers = this.layerGain(active)
      runtime.specialStacks[key] = this.applyLayerCap(active.sourceId, key, (runtime.specialStacks[key] ?? 0) + layers)
      this.onLayersGained(active.sourceId, key, layers, frame, runtimes)
    }
  }

  private removeActive(index: number, frame: number, runtimes: Map<number, StudentRuntimeState>, action: 'expired' | 'consumed' | 'replaced' | 'dispelled'): void {
    const active = this.active[index]
    if (!active) return
    const runtime = [...runtimes.values()].find(r => r.studentId === active.targetId)
    if (runtime) {
      if (active.effect.Type === 'Shield') runtime.shield = Math.max(0, runtime.shield - Math.max(0, active.amount))
      if (active.effect.Type === 'Summon') { const key = String(active.effect.SummonId ?? active.key); runtime.summons[key] = Math.max(0, (runtime.summons[key] ?? 1) - 1) }
      if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(active.effect.Type)) {
        const layers = this.layerGain(active)
        runtime.specialStacks[active.key] = Math.max(0, (runtime.specialStacks[active.key] ?? 0) - layers * active.stacks)
      }
    }
    this.active.splice(index, 1)
    if (runtime && (active.effect.Type === 'CrowdControl' || active.effect.Type === 'Knockback')) {
      runtime.controlledUntil = this.active.reduce((until, item) => item.targetId === runtime.studentId && ['CrowdControl', 'Knockback'].includes(item.effect.Type)
        ? Math.max(until, item.expiresAt ?? Infinity) : until, 0)
    }
    this.audit.push({ frame, issuerId: active.sourceId, targetIds: [active.targetId], skillRef: active.skillRef, effectIndex: -1, effectType: active.effect.Type, action, detail: active.key, effectId: active.id, stat: active.effect.Stat, value: active.amount, valueType: active.effect.Type === 'CostChange' ? normalizeCostChangeValueType(active.effect.ValueType) : undefined, uses: active.effect.Type === 'CostChange' ? active.uses : undefined, expiresAt: active.expiresAt })
    // 自身 EX Buff 被移除（过期/替换/驱散）时，同步移除同失效帧的自动 SS Buff。
    if (active.effect.Type === 'Buff' && active.skillRef.kind === 'ex' && active.targetId === active.sourceId && rules.skill.selfExBuffEpIds.has(active.sourceId)) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const linked = this.active[i]
        if (linked && linked.targetId === active.targetId && linked.sourceId === active.sourceId && linked.skillRef.kind === 'extra_passive' && linked.expiresAt === active.expiresAt) {
          this.removeActive(i, frame, runtimes, action)
        }
      }
    }
  }

  private dispel(targetId: EffectTargetId, frame: number, runtimes: Map<number, StudentRuntimeState>, pending: PendingEffect): void {
    const removable = new Set(rules.mechanics.dispelDefault)
    for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i]?.targetId === targetId && removable.has(this.active[i]!.effect.Type)) this.removeActive(i, frame, runtimes, 'dispelled')
    this.audit.push({ frame, issuerId: pending.issuerId, targetIds: [targetId], skillRef: pending.skillRef, effectIndex: pending.effectIndex, effectType: 'Dispel', action: 'applied' })
  }

  private isFormationFull(): boolean {
    const required = this.formation.mode === 'normal' ? 6 : 10
    return this.formation.slots.length >= required
      && this.formation.slots.slice(0, required).every(studentId => studentId != null)
  }

  private recordLedger(frame: number, pending: PendingEffect, targetId: EffectTargetId, effect: SkillEffect, value: number, detail?: string): void {
    const type = effect.Type as EffectLedgerEntry['effectType']
    this.ledger.push({ frame, issuerId: pending.issuerId, targetId, skillRef: pending.skillRef, effectType: type, value, hits: effect.Hits?.length ?? 1, detail })
  }

  /** Special 状态一次施加/移除的层数：有效果数值按数值取整，否则按 1 层（历史语义）。 */
  private layerGain(active: ActiveEffect): number {
    const key = active.key
    const isLayerKey = rules.mechanics.layerCaps[`${active.sourceId}:${key}`] != null
      || rules.mechanics.layerDecays.some(decay => decay.issuerId === active.sourceId && decay.key === key)
      || rules.mechanics.layerGrants.some(grant => grant.sourceKey === key)
    return isLayerKey ? Math.max(1, Math.round(active.amount || 0)) : 1
  }

  private applyLayerCap(sourceId: number, key: string, value: number): number {
    const cap = rules.mechanics.layerCaps[`${sourceId}:${key}`]
    return cap == null ? value : Math.min(cap, value)
  }

  /** 层数增加后的副作用：重置时间衰减、推进全队阈值授予。 */
  private onLayersGained(sourceId: number, key: string, layers: number, frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (const decay of rules.mechanics.layerDecays) {
      if (decay.issuerId === sourceId && decay.key === key) {
        this.state.decayNext.set(`${sourceId}:${key}`, frame + Math.ceil(decay.everyMs * 30 / 1000))
      }
    }
    for (const grant of rules.mechanics.layerGrants) {
      if (grant.sourceKey !== key) continue
      const progressKey = `grant:${grant.sourceKey}`
      const before = this.state.layerGrantProgress.get(progressKey) ?? 0
      const after = before + layers
      this.state.layerGrantProgress.set(progressKey, after)
      const granted = Math.floor(after / grant.perLayers) - Math.floor(before / grant.perLayers)
      if (granted <= 0) continue
      const target = [...runtimes.values()].find(runtime => runtime.studentId === grant.issuerId)
      if (!target) continue
      target.specialStacks[grant.targetKey] = Math.min(grant.cap, (target.specialStacks[grant.targetKey] ?? 0) + granted)
    }
  }

  private advanceLayerDecay(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (const decay of rules.mechanics.layerDecays) {
      const mapKey = `${decay.issuerId}:${decay.key}`
      const next = this.state.decayNext.get(mapKey)
      if (next == null || frame < next) continue
      const runtime = [...runtimes.values()].find(value => value.studentId === decay.issuerId)
      if (!runtime) continue
      const current = runtime.specialStacks[decay.key] ?? 0
      if (current <= 0) {
        this.state.decayNext.delete(mapKey)
        continue
      }
      runtime.specialStacks[decay.key] = Math.max(0, current - decay.remove)
      this.state.decayNext.set(mapKey, frame + Math.ceil(decay.everyMs * 30 / 1000))
    }
  }

  /** 动态伤害：Damage 执行时按层数规则放大数值。 */
  private damageValue(pending: PendingEffect, targetId: EffectTargetId, runtimes: Map<number, StudentRuntimeState>): number {
    const rule = rules.mechanics.dynamicDamageRules[pending.issuerId]
    if (!rule) return this.baseDamageValue(pending, targetId)
    const kind = pending.skillRef.kind
    if (kind !== 'public' && kind !== 'gear_public' && kind !== 'extra_passive') return this.baseDamageValue(pending, targetId)
    if (!rule.skillRefs.includes(kind)) return this.baseDamageValue(pending, targetId)
    const base = this.baseDamageValue(pending, targetId)
    return this.scaleDamageValue(base, rule, runtimes, pending.issuerId)
  }

  private baseDamageValue(pending: PendingEffect, targetId: EffectTargetId): number {
    return effectAmount(pending.effect, pending.skillLevel, pending.valueRowByTarget?.get(targetId) ?? pending.valueRow)
  }

  private scaleDamageValue(base: number, rule: DynamicDamageRule, runtimes: Map<number, StudentRuntimeState>, issuerId: number): number {
    if (rule.kind === 'team-layer-multiplier') {
      const total = [...runtimes.values()].reduce((sum, runtime) => sum + (runtime.specialStacks[rule.key] ?? 0), 0)
      const layers = Math.min(total, rule.maxLayers ?? 0)
      return base * (1 + layers * (rule.perLayer ?? 0))
    }
    const runtime = [...runtimes.values()].find(value => value.studentId === issuerId)
    const layers = runtime?.specialStacks[rule.key] ?? 0
    return base * layers
  }
}
