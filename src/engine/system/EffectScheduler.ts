/**
 * EffectScheduler：负责“技能什么时候生效”——把技能效果转为 pending 队列 /
 * 召唤物分组，ApplyFrame=0 的立即交给 Executor 执行。
 */
import type { Student, SkillEffect } from '../../types/student'
import type { EffectAuditRecord, Formation, Intent, SchedulingDiagnostic, SkillRef, StudentRuntimeState } from '../model/types'
import { rules } from '../../domain/rules/GameRules'
import type { ValueRowRule } from '../../domain/rules/GameRules'
import { resolveSummonRefs } from './summonTargets'
import type { EffectExecutor } from './EffectExecutor'
import type { EffectRuntimeState, EffectTargetId, PendingEffect, PendingSummon } from './effectRuntime'
import type { ResolvedSkill } from './SkillResolver'

export class EffectScheduler {
  static ruleBindings() { return { 'target.resolve': this.prototype.resolveTargets, 'action.pendingInterruption': this.prototype.interruptAction } }
  readonly actionDiagnostics: SchedulingDiagnostic[] = []
  private readonly interrupted = new Map<string, number>()
  private readonly diagnosed = new Set<string>()
  private readonly automaticActions = new Set<string>()
  protected readonly pending: PendingEffect[]
  protected readonly pendingSummons: PendingSummon[]
  protected readonly cycleCursor: Map<string, number>
  readonly audit: EffectAuditRecord[]
  protected readonly students: Map<number, Student>
  protected readonly formation: Formation
  protected readonly state: EffectRuntimeState
  private readonly executor: EffectExecutor

  constructor(
    state: EffectRuntimeState,
    students: Map<number, Student>,
    formation: Formation,
    executor: EffectExecutor,
  ) {
    this.state = state
    this.pending = state.pending
    this.pendingSummons = state.pendingSummons
    this.cycleCursor = state.cycleCursor
    this.audit = state.audit
    this.students = students
    this.formation = formation
    this.executor = executor
  }

  /** No unverified cancellation is guessed. Already applied effects/ticks stay independent. */
  interruptAction(actionId: string, frame: number): void {
    this.interrupted.set(actionId, frame)
    for (const pending of this.pending) if (pending.actionId === actionId && !pending.isTick) this.diagnoseInterruption(pending)
    for (const pending of this.pendingSummons) if (pending.actionId === actionId) this.diagnoseInterruption(pending)
  }

  markAutomaticAction(actionId: string): void { this.automaticActions.add(actionId) }

  beforeApply(pending: PendingEffect | PendingSummon): boolean {
    this.diagnoseInterruption(pending)
    if (pending.actionId == null || !this.automaticActions.has(pending.actionId)
      || !this.interrupted.has(pending.actionId) || 'isTick' in pending && pending.isTick) return true
    const indices = 'effectIndex' in pending ? [pending.effectIndex] : pending.effectIndexes
    for (const index of indices) this.audit.push({ frame: pending.frame, issuerId: pending.issuerId,
      targetIds: 'targetIds' in pending ? pending.targetIds : [pending.issuerId], skillRef: pending.skillRef,
      effectIndex: index, effectType: 'effect' in pending ? pending.effect.Type : 'Summon', actionId: pending.actionId,
      action: 'rejected', detail: '自动动作中断后的待生效效果缺少规则，需要人工确认' })
    return false
  }

  diagnoseInterruption(pending: PendingEffect | PendingSummon): void {
    const frame = pending.actionId == null ? undefined : this.interrupted.get(pending.actionId)
    if (frame == null || 'isTick' in pending && pending.isTick) return
    const indices = 'effectIndex' in pending ? [pending.effectIndex] : pending.effectIndexes
    for (const index of indices) {
      const key = `${pending.actionId}:${index}`
      if (this.diagnosed.has(key)) continue
      this.diagnosed.add(key)
      this.actionDiagnostics.push({ studentId: pending.issuerId, frame, actionId: pending.actionId,
        code: 'UNVERIFIED_PENDING_INTERRUPT', path: `${pending.issuerId}:${pending.skillRef.kind}.Effects[${index}]`,
        message: this.automaticActions.has(pending.actionId!)
          ? `自动 NS 已中断；F${pending.frame} 的待生效效果停止自动执行，需要人工确认`
          : `动作已中断；F${pending.frame} 的待生效效果暂保留。${rules.action.pendingInterruption.limitations}` })
    }
  }

  schedule(intent: Intent, skill: ResolvedSkill, frame: number, runtimes: Map<number, StudentRuntimeState>, actionId?: string): void {
    // 按次数选行的规则：一次施放只递增一次计数，本施放内所有效果共用同一行。
    const castCountRow = this.nextCastCountRow(intent.issuerId, skill)
    const summonGroups = new Map<string, { effectIndexes: number[]; effects: SkillEffect[]; valueRows: number[] }>()
    for (const [effectIndex, effect] of skill.effects.entries()) {
      if (rules.skill.effectPolicy(effect.Type)?.handler === 'effect.summon') {
        // 保持对旧数据/测试用占位 Summon 的兼容：只有带 SummonId 的效果
        // 才能建立可寻址的召唤物实例；其余仍作为普通效果进入审计。
        if (effect.SummonId == null) {
          const targetIds = this.resolveTargets(effect, intent)
          const pendingEffect: PendingEffect = { actionId, frame: frame + (effect.ApplyFrame ?? 0), issuerId: intent.issuerId, skillRef: skill.ref, effectIndex, effect, targetIds, conditionEndFrame: intent.trigger?.conditionEndFrame, skillLevel: skill.level, valueRow: 0 }
          this.diagnoseInterruption(pendingEffect)
          if (pendingEffect.frame <= frame) this.executor.apply(pendingEffect, frame, runtimes)
          else this.pending.push(pendingEffect)
          this.audit.push({ frame, issuerId: intent.issuerId, targetIds, skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'scheduled', detail: 'legacy summon without SummonId' })
          continue
        }
        const valueRow = this.resolveValueRow(intent.issuerId, skill.ref, effect, runtimes, castCountRow)
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
      const valueRow = this.resolveValueRow(intent.issuerId, skill.ref, effect, runtimes, castCountRow)
      if (valueRow < 0) {
        this.audit.push({ frame, issuerId: intent.issuerId, targetIds: [], skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'rejected', detail: 'formation condition not met' })
        continue
      }
      const targetIds = this.resolveTargets(effect, intent)
      const valueRowByTarget = this.resolveValueRowByTarget(intent.issuerId, skill.ref, effect, targetIds)
      const pendingEffect: PendingEffect = { actionId, frame: frame + (effect.ApplyFrame ?? 0), issuerId: intent.issuerId, skillRef: skill.ref, effectIndex, effect, targetIds, valueRowByTarget, conditionEndFrame: intent.trigger?.conditionEndFrame, skillLevel: skill.level, valueRow }
      this.diagnoseInterruption(pendingEffect)
      if (pendingEffect.frame <= frame) this.executor.apply(pendingEffect, frame, runtimes)
      else this.pending.push(pendingEffect)
      const detail = `${intent.trigger?.source ?? intent.triggerSource ?? 'manual'}${intent.trigger?.reasons?.length ? `:${intent.trigger.reasons.join(',')}` : ''}`
      this.audit.push({ frame, issuerId: intent.issuerId, targetIds, skillRef: skill.ref, effectIndex, effectType: effect.Type, action: 'scheduled', detail })
    }
    const selectedCycles = new Map<string, number>()
    for (const group of summonGroups.values()) {
      const summonId = group.effects[0]?.SummonId
      if (summonId == null) continue
      const rule = rules.summon.rule(summonId)
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
      const rule = rules.summon.rule(summonId)
      if (rule.cycle) {
        const cycleKey = `${intent.issuerId}:${rule.cycle.join(',')}`
        if (selectedCycles.get(cycleKey) !== summonId) continue
      }
      const pendingSummon: PendingSummon = {
        actionId,
        frame: frame + (effect.ApplyFrame ?? 0),
        issuerId: intent.issuerId,
        sourceEventId: intent.id,
        skillRef: skill.ref,
        effectIndexes: group.effectIndexes,
        effects: group.effects,
        valueRows: group.valueRows,
        skillLevel: skill.level,
      }
      this.diagnoseInterruption(pendingSummon)
      if (pendingSummon.frame <= frame) this.executor.createSummon(pendingSummon, frame, runtimes)
      else this.pendingSummons.push(pendingSummon)
      for (const effectIndex of group.effectIndexes) {
        this.audit.push({ frame, issuerId: intent.issuerId, targetIds: [intent.issuerId], skillRef: skill.ref, effectIndex, effectType: 'Summon', action: 'scheduled', detail: `summon:${summonId}` })
      }
    }
  }

  private resolveValueRow(issuerId: number, skillRef: SkillRef, effect: SkillEffect, runtimes: Map<number, StudentRuntimeState>, castCountRow?: number): number {
    const rule = rules.mechanics.valueRowRule(issuerId)
    if (!rule || !this.ruleMatchesSkillRef(rule, skillRef) || (effect.Value?.length ?? 0) <= 1) return 0
    if (rule.stat != null && effect.Stat !== rule.stat) return 0
    const formationStudents = this.formation.slots.flatMap(id => {
      const student = id == null ? undefined : this.students.get(id)
      return student ? [student] : []
    })
    switch (rule.kind) {
      case 'name-prefix':
        return formationStudents.some(student => student.Name.startsWith(rule.prefix)) ? rule.matchRow : rule.otherRow
      case 'school-count': {
        const count = formationStudents.filter(student => student.School === rule.school).length
        if (rule.minCount != null && count < rule.minCount) return -1
        return Math.min(rule.cap, Math.max(0, count + rule.offset))
      }
      case 'name-pattern': {
        const count = formationStudents.filter(student =>
          (!rule.excludeSelf || student.Id !== issuerId)
          && new RegExp(rule.pattern).test(student.Name)).length
        return Math.min(rule.cap, Math.max(0, count + rule.offset))
      }
      case 'heavy-armor-main-count': {
        const count = formationStudents.filter(student => student.Id !== issuerId && student.SquadType === 'Main' && student.ArmorType === 'HeavyArmor').length
        return Math.min(rule.cap, count)
      }
      case 'cast-count':
        return castCountRow ?? 0
      case 'target-has-special':
        return rule.rows[0]
      case 'layer-index': {
        const runtime = [...runtimes.values()].find(value => value.studentId === issuerId)
        const stacks = runtime?.specialStacks[rule.key] ?? 0
        return Math.min(stacks, (effect.Value?.length ?? 1) - 1)
      }
    }
  }

  /** cast-count 规则：取当前施放次数作为行，并递增计数（仅成功进入调度的施放递增）。 */
  private nextCastCountRow(issuerId: number, skill: ResolvedSkill): number | undefined {
    const rule = rules.mechanics.valueRowRule(issuerId)
    if (rule?.kind !== 'cast-count' || !this.ruleMatchesSkillRef(rule, skill.ref)) return undefined
    if (!skill.effects.some(effect => (effect.Value?.length ?? 0) > 1)) return undefined
    const key = `${issuerId}:ns-family`
    const row = this.state.castCounts.get(key) ?? 0
    this.state.castCounts.set(key, row + 1)
    return row
  }

  /** target-has-special 规则：按每个目标是否持有指定状态生成行映射。 */
  private resolveValueRowByTarget(
    issuerId: number,
    skillRef: SkillRef,
    effect: SkillEffect,
    targetIds: EffectTargetId[],
  ): Map<EffectTargetId, number> | undefined {
    const rule = rules.mechanics.valueRowRule(issuerId)
    if (rule?.kind !== 'target-has-special' || !this.ruleMatchesSkillRef(rule, skillRef)) return undefined
    if (rule.stat != null && effect.Stat !== rule.stat) return undefined
    if ((effect.Value?.length ?? 0) <= 1) return undefined
    return new Map(targetIds.map(targetId => [
      targetId,
      this.activeHasSpecial(targetId, rule.key) ? rule.rows[1] : rule.rows[0],
    ]))
  }

  private ruleMatchesSkillRef(rule: ValueRowRule, skillRef: SkillRef): boolean {
    const refs = rule.skillRefs ?? (['extra_passive'] as const)
    return skillRef.kind === 'public' || skillRef.kind === 'gear_public' || skillRef.kind === 'extra_passive'
      ? refs.includes(skillRef.kind)
      : false
  }

  private activeHasSpecial(targetId: EffectTargetId, key: string): boolean {
    return this.state.active.some(active =>
      active.targetId === targetId && active.effect.Type === 'Special' && active.key === key)
  }

  private resolveTargets(effect: SkillEffect, intent: Intent): EffectTargetId[] {
    const selected = new Set<EffectTargetId>(); const selectors = rules.targeting.normalizedTargets(effect)
    if (!selectors.length) {
      intent.targetIds.forEach(id => selected.add(id))
      intent.targetSummonIds?.forEach(id => selected.add(id))
      resolveSummonRefs(this.state.summons, intent.targetSummonRefs).forEach(id => selected.add(id))
    }
    for (const selector of selectors) {
      if (selector === 'Self') selected.add(intent.issuerId)
      else if (selector === 'Enemy') selected.add(-1)
      else if (selector === 'Any' || selector === 'Ally') {
        intent.targetIds.forEach(id => { if (selector === 'Any' || id !== -1) selected.add(id) })
        intent.targetSummonIds?.forEach(id => selected.add(id))
        resolveSummonRefs(this.state.summons, intent.targetSummonRefs).forEach(id => selected.add(id))
      }
      else if (selector === 'AllyMain' || selector === 'AllySupport') {
        for (const id of this.formation.slots) {
          const student = id == null ? undefined : this.students.get(id)
          if (id != null && id !== intent.issuerId && student && (selector === 'AllyMain' ? student.SquadType === 'Main' : student.SquadType === 'Support')) selected.add(id)
        }
        if (rules.summon.allyBuffIncludesSummon.has(`${intent.issuerId}:${intent.skillRef?.kind ?? ''}`)) {
          for (const summon of this.state.summons) {
            if (summon.active) selected.add(summon.instanceId)
          }
        }
      }
    }
    return [...selected]
  }
}
