/**
 * SkillValidator：负责“技能是否可执行”——目标、条件、FormChange、CostOverload 等校验。
 * 运行时状态（active / summons）通过只读访问器注入，不持有可变状态。
 */
import type { Student } from '../../types/student'
import type { BattleEnv, Formation, Intent, SkillRef, StudentRuntimeState } from '../model/types'
import type { EffectTargetId } from './effectRuntime'
import { rules } from '../../domain/rules/GameRules'
import type { ResolvedSkill } from './SkillResolver'

export interface ValidatorState {
  active: ReadonlyArray<{ targetId: EffectTargetId; key: string; stacks: number; effect: { Type: string; Channel?: number } }>
  summons: ReadonlyArray<{ active: boolean; instanceId: string; summonId: number; sourceEventId: string; spawnIndex: number }>
  castCounts: ReadonlyMap<string, number>
}

export class SkillValidator {
  static ruleBindings() { return { 'condition.validate': this.prototype.validateCondition } }
  private readonly students: Map<number, Student>
  private readonly formation: Formation
  private readonly env: BattleEnv
  private readonly state: () => ValidatorState

  constructor(
    students: Map<number, Student>,
    formation: Formation,
    env: BattleEnv,
    state: () => ValidatorState,
  ) {
    this.students = students
    this.formation = formation
    this.env = env
    this.state = state
  }

  validate(intent: Intent, skill: ResolvedSkill, runtimes: Map<number, StudentRuntimeState>, allowExtraEx = false, isCopied = false): string | null {
    const { active, summons, castCounts } = this.state()
    if (!this.students.has(intent.issuerId)) return 'unknown caster'
    const targetSummonIds = [...(intent.targetSummonIds ?? [])]
    for (const ref of intent.targetSummonRefs ?? []) {
      const instance = summons.find(summon => summon.active && summon.summonId === ref.summonId && summon.sourceEventId === ref.sourceEventId && summon.spawnIndex === ref.spawnIndex)
      if (!instance) return `summon reference ${ref.sourceEventId}/${ref.summonId}/${ref.spawnIndex} is not active`
      targetSummonIds.push(instance.instanceId)
    }
    const selectedTargets: EffectTargetId[] = [...intent.targetIds, ...targetSummonIds]
    if (!selectedTargets.length && this.requiresManualTarget(skill)) return 'target is required'
    if (new Set(selectedTargets).size !== selectedTargets.length) return 'duplicate targets are not allowed'
    const hasCostOverload = skill.effects.some(effect => effect.Type === 'Special' && effect.Key === 'CostOverload')
    if (hasCostOverload && selectedTargets.length !== 1) return 'CostOverload requires exactly one target'
    for (const targetId of selectedTargets) {
      if (typeof targetId === 'string') {
        if (!summons.some(summon => summon.active && summon.instanceId === targetId)) return `summon target ${targetId} is not active`
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
    // friend-marker 机制（伊吹泳装等）：本人首放必须选定 1-2 名指定编队类型的目标；
    // 莉音复制他人卡牌时该卡并非由机制所有者本人施放，不做首放约束。
    const mechanic = rules.mechanics.cardMechanic(intent.issuerId)
    if (mechanic?.kind === 'friend-marker' && skill.ref.kind === 'ex' && !isCopied) {
      const targets = intent.targetIds.filter(id => id !== -1 && id !== intent.issuerId)
      const valid = targets.length >= mechanic.minTargets
        && targets.length <= mechanic.maxTargets
        && targets.every(id => {
          const target = this.students.get(id)
          return target?.SquadType === mechanic.targetSquadType && this.formation.slots.includes(id)
        })
      if (!valid) return `friend target: 需要选择 ${mechanic.minTargets}-${mechanic.maxTargets} 名${mechanic.targetSquadType === 'Main' ? '前锋' : '支援'}作为好朋友`
    }
    // cast-count 规则：达到施放上限后拒绝再次施放（如若藻泳装 NS 第 3 次后）。
    const castRule = rules.mechanics.valueRowRule(intent.issuerId)
    if (castRule?.kind === 'cast-count' && this.ruleAppliesToSkill(castRule, intent.skillRef)) {
      const count = castCounts.get(`${intent.issuerId}:ns-family`) ?? 0
      if (count >= castRule.maxUses) return `该技能已使用满 ${castRule.maxUses} 次`
    }
    if (skill.ref.kind === 'extra_passive' && rules.skill.selfExBuffEpIds.has(intent.issuerId)) return 'SS auto-triggers with the EX and cannot be cast manually'
    if (intent.trigger?.conditionEndFrame != null && intent.trigger.conditionEndFrame < intent.frame) return 'condition end frame precedes trigger'
    if (skill.effects.some(e => e.Duration != null && e.Duration < 0) && intent.trigger?.source === 'manual' && intent.trigger.conditionEndFrame == null) return 'conditional effect requires an end frame'
    if (skill.ref.kind === 'extra_ex' && !allowExtraEx && !this.hasFormChange(intent.issuerId, active)) return 'extra EX requires an active FormChange state'
    for (const effect of skill.effects) {
      const failure = effect.Condition ? this.validateCondition(effect.Condition, caster, selectedTargets, skill, active) : null
      if (failure) return failure
    }
    return null
  }

  private ruleAppliesToSkill(rule: { skillRefs?: readonly ('public' | 'gear_public' | 'extra_passive')[] }, ref: SkillRef | undefined): boolean {
    if (!ref) return false
    if (ref.kind !== 'public' && ref.kind !== 'gear_public' && ref.kind !== 'extra_passive') return false
    const refs = rule.skillRefs ?? (['extra_passive'] as const)
    return refs.includes(ref.kind)
  }

  private requiresManualTarget(skill: ResolvedSkill): boolean {
    return rules.targeting.requiresManualTarget(skill.effects)
  }

  private allowsEnemy(skill: ResolvedSkill): boolean {
    return skill.effects.some(effect => rules.targeting.normalizedTargets(effect).some(target => target === 'Enemy' || target === 'Any'))
  }

  private allowsAllySelection(skill: ResolvedSkill): boolean {
    return skill.effects.some(effect => rules.targeting.normalizedTargets(effect).some(target => target === 'Ally' || target === 'Any'))
  }

  private hasFormChange(studentId: number, active: ValidatorState['active']): boolean {
    return active.some(entry => entry.targetId === studentId && entry.effect.Type === 'Special' && rules.skill.specialRule(entry.key)?.unlocksExtraEx === true)
  }

  private validateCondition(
    condition: unknown,
    runtime: StudentRuntimeState,
    targetIds: EffectTargetId[],
    skill: ResolvedSkill,
    active: ValidatorState['active'],
  ): string | null {
    if (!condition || typeof condition !== 'object') return null
    const c = condition as { Type?: string; Parameter?: string; Operand?: string; Value?: unknown }
    const within = (actual: number, value: unknown) => { const v = Array.isArray(value) ? value : [value, value]; return actual >= Number(v[0] ?? 0) && actual <= Number(v[1] ?? v[0] ?? Number.POSITIVE_INFINITY) }
    if (c.Type === 'BuffCount') return within(active.filter(a => a.targetId === runtime.studentId && a.key === (c.Parameter ?? '')).reduce((sum, a) => sum + a.stacks, 0), c.Value) ? null : `BuffCount ${c.Parameter ?? ''} not in range`
    if (c.Type === 'Special') { const exists = (runtime.specialStacks[c.Parameter ?? ''] ?? 0) > 0; return exists === (c.Value !== false) ? null : `Special ${c.Parameter ?? ''} condition not met` }
    if (c.Type === 'SkillLevel') return within(skill.level, c.Value) ? null : `SkillLevel ${skill.level} not in range`
    if (c.Type === 'TargetProp') {
      const id = targetIds.find((target): target is number => typeof target === 'number' && target !== -1)
      const source = id == null ? { ArmorType: this.env.armorType } : this.students.get(id)
      if (!source || !c.Parameter || !(c.Parameter in source)) return null
      const equal = (source as Record<string, unknown>)[c.Parameter] === c.Value
      return (c.Operand === 'NotEqual' ? !equal : equal) ? null : `TargetProp ${c.Parameter} condition not met`
    }
    return null
  }
}
