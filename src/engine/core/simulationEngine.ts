/**
 * SimulationEngine — SDD v4.0 核心推演引擎
 *
 * 遵循确定性原则：
 * - 严禁 Math.random() / Date.now()
 * - 时间标尺统一为整数 frame
 * - Cost 计算采用放大整数模型 (Cost * 10000)
 * - 遍历实体按 Formation Index 固定顺序
 * - 同帧同优先级按 Intent 插入次序兜底排序
 *
 * Tick Pipeline (每帧严格顺序):
 *   1. Clock Update      — currentFrame++
 *   2. Buff/CC Update    — 结算自然回复、更新 Buff/Debuff/CC 持续
 *   3. FSM Tick          — 步进所有角色的动作帧
 *   4. Trigger Scheduler — 检查触发条件，处理延迟挂起队列
 *   5. Intent Resolve    — 收集本帧 Intent，验证合法性
 *   6. Intent Priority Sort — 稳定排序 (CC > EX > NS)
 *   7. FSM Apply         — 注入角色状态机跳转
 *   8. Logging           — 压入日志记录
 */

import type { Student } from '../../types/student'
import { normalizeTrigger, automaticNsError, requiredTriggerReasons } from '../../domain/triggerEvidence'
import type {
  Intent,
  BattleEnv,
  Formation,
  SimulationResult,
  SimulationError,
  StudentRuntimeState,
  SkillRef,
  NsSchedulingConfig,
} from '../model/types'
import { StudentState } from '../model/types'
import { isInterruptible } from '../model/fsm'
import {
  COST_SCALE,
  formationMaxCost,
} from '../system/costSystem'
import { StudentEffectSystem } from '../system/studentEffectSystem'
import { resolveSkill, type ResolvedSkill } from '../system/SkillResolver'
import { rules } from '../../domain/rules/GameRules'
import { CardOrderSystem, inferGreedyDeck, type CardPlayPlan } from '../system/cardOrderSystem'
import { CostSystem } from '../state/CostSystem'
import type { BattleState } from '../state/BattleState'
import { ActionSystem } from '../system/ActionSystem'
import { NsScheduler } from '../system/NsScheduler'

/** 纯输入：引擎不关心输入来源（UI 拖拽 / 自动搜索 / 导入 / 测试）。 */
export interface SimulationInput {
  env: BattleEnv
  formation: Formation
  students: Map<number, Student>
  intents: Intent[]
  nsScheduling?: NsSchedulingConfig
}

// ═══════════════════════════════════════════════════
// Engine 门面
// ═══════════════════════════════════════════════════

export class SimulationEngine {
  private env!: BattleEnv
  private formation!: Formation
  private students: Map<number, Student> = new Map()

  /** 加载战斗环境 */
  loadBattle(env: BattleEnv, formation: Formation, students: Map<number, Student>): void {
    this.env = env
    this.formation = formation
    this.students = students
  }

  /** 从纯输入直接推演（内部完成 loadBattle）。 */
  simulateInput(input: SimulationInput): SimulationResult {
    this.loadBattle(input.env, input.formation, input.students)
    return this.simulate(input.intents, input.nsScheduling)
  }

  /**
   * 执行全量推演
   *
   * @param intents 用户指令列表 (EX_CAST)
   */
  /**
   * 确定性学生技能推演。所有失败的 intent 在改变 Cost、牌序或状态前被拒绝。
   */
  simulate(intents: Intent[], nsScheduling?: NsSchedulingConfig): SimulationResult {
    const nsScheduler = new NsScheduler(this.formation, this.students, intents, nsScheduling)
    const maxFrame = this.env.maxFrame
    const errors: SimulationError[] = []
    const runtimes = new Map<number, StudentRuntimeState>()
    for (let slot = 0; slot < this.formation.slots.length; slot++) {
      const studentId = this.formation.slots[slot]
      if (studentId != null) runtimes.set(slot, this.initRuntime(slot, studentId))
    }

    const effects = new StudentEffectSystem(this.students, this.formation, this.env)
    const actions = new ActionSystem(runtimes, (actionId, frame) => effects.interruptAction(actionId, frame))
    effects.observeActions(audit => actions.effectApplied(audit), frame => actions.syncControl(frame))
    for (const runtime of runtimes.values()) {
      const student = this.students.get(runtime.studentId)
      if (!student || student.SquadType !== 'Main') continue
      const inspection = rules.action.inspect(student)
      actions.diagnostics.push(...inspection.diagnostics.map(d => ({ studentId: student.Id, code: d.code, path: d.path, message: d.message })))
    }
    let initialCostUnits = 0
    // Only versioned battle-start clauses are automatic. Later clauses in the
    // same NS/SS remain manual facts and are excluded by effectIndices.
    for (const runtime of runtimes.values()) {
      const student = this.students.get(runtime.studentId)
      if (!student) continue
      for (const spec of rules.trigger.automatic(student, this.formation.gearLevels?.[runtime.slotIndex] ?? 1)) {
        const ref = spec.skillRef
        if (
          ref.kind === 'weapon_passive'
          && (this.formation.uniqueWeaponLevels?.[runtime.slotIndex] ?? 0) < 2
        ) continue
        const skill = resolveSkill(student, ref, this.getSkillLevels(runtime.slotIndex))
        if (!skill) continue
        const sourceEffects = spec.effectIndices == null
          ? skill.effects
          : spec.effectIndices.flatMap(index => {
            const effect = skill.effects[index]
            return effect ? [effect] : []
          })
        const openingSkill: ResolvedSkill = {
          ...skill,
          effects: [...sourceEffects, ...(spec.syntheticEffects ?? [])],
        }
        const entryTargets = this.formation.slots.filter((id): id is number => id != null && id !== student.Id)
        if (openingSkill.effects.length) {
          effects.schedule({
            id: `entry-${runtime.slotIndex}-${ref.kind}`,
            frame: 0,
            type: skill.action === 'NS' ? 'NS_TRIGGER' : 'SS_TRIGGER',
            issuerId: student.Id,
            targetIds: entryTargets,
            priority: 1,
            skillRef: ref,
            triggerSource: 'automatic',
            trigger: { source: 'automatic' },
          }, openingSkill, 0, runtimes)
        }
        if (spec.initialCostByLevel?.length) {
          const grant = spec.initialCostByLevel[skill.level - 1] ?? spec.initialCostByLevel[0] ?? 0
          initialCostUnits += grant
          effects.audit.push({
            frame: 0,
            issuerId: student.Id,
            targetIds: [student.Id],
            skillRef: ref,
            effectIndex: -1,
            effectType: 'CostGrant',
            action: 'applied',
            detail: `+${grant} COST`,
          })
        }
      }
    }

    const byFrame = new Map<number, Intent[]>()
    const acceptedIntents: Intent[] = []
    const automaticKeys = new Set<string>()
    for (const original of intents) {
      const evidence = normalizeTrigger(original)
      const slot = this.resolveSlot(original.issuerId)
      const student = this.students.get(original.issuerId)
      let failure = 'error' in evidence ? evidence.error : null
      if (!Number.isInteger(original.frame) || original.frame < 0 || original.frame > maxFrame) failure = '触发帧必须是模拟范围内的非负整数'
      const ref = student ? this.intentSkillRef(original, student, this.formation.gearLevels?.[slot] ?? 1) : undefined
      const resolved = student && ref ? resolveSkill(student, ref, this.getSkillLevels(slot)) : null
      if (!failure && !('error' in evidence) && resolved && student && ref) {
        if (evidence.trigger.source === 'automatic') {
          failure = original.type !== 'NS_TRIGGER' ? '外部自动事件只允许已登记的周期 NS' : automaticNsError(student, ref, resolved.effects, this.formation.gearLevels?.[slot] ?? 1, original.frame)
          const key = `${original.issuerId}:${ref.kind}:${original.frame}`
          if (!failure && automaticKeys.has(key)) failure = '同一技能同一周期的自动事件重复'
          if (!failure) automaticKeys.add(key)
        } else {
          if (ref.kind === 'passive' || ref.kind === 'weapon_passive' || ref.kind === 'extra_passive' && rules.skill.selfExBuffEpIds.has(student.Id)) {
            failure = '开局被动及关联 EX 效果由引擎内部生成，不能作为外部事件重复注入'
          } else {
            const missing = requiredTriggerReasons(resolved.effects, student.Id, ref).filter(reason => !evidence.trigger.reasons?.includes(reason))
            if (missing.length) failure = `需要用户确认触发事实：${missing.join(', ')}`
          }
        }
      }
      if (failure || 'error' in evidence) {
        errors.push({ frame: original.frame, issuerId: original.issuerId, type: 'INVALID_TRIGGER', message: failure ?? '触发事实非法' })
        continue
      }
      const intent = { ...original, ...evidence }
      acceptedIntents.push(intent)
      const list = byFrame.get(intent.frame) ?? []
      list.push(intent)
      byFrame.set(intent.frame, list)
    }

    // 牌序校验恒开启：未自定义初始牌序时，按时间轴施放顺序贪心推断牌库。
    const effectiveDeck = this.formation.deckOrder ?? inferGreedyDeck(this.formation.slots, acceptedIntents)
    const cards = new CardOrderSystem({ ...this.formation, deckOrder: effectiveDeck }, this.students)

    const activeLanes = this.formation.slots.filter((id): id is number => id != null)
    const baseRegen = activeLanes.reduce((sum, id) => sum + (this.students.get(id)?.Regen || 700), 0)
    const maxCost = formationMaxCost(this.formation, this.students)
    const cost = new CostSystem(maxCost, initialCostUnits * COST_SCALE)
    const debt: { current: { studentId: number; skillRef: SkillRef } | null } = { current: null }
    const state: BattleState = {
      frame: 0,
      formation: this.formation,
      runtimes,
      cards,
      effects,
      cost,
      actions,
      nsScheduler,
    }

    for (let frame = 0; frame <= maxFrame; frame++) {
      this.processFrame(state, frame, baseRegen, byFrame, errors, debt)
      state.cost.recordFrame()
    }

    nsScheduler.finish(maxFrame)
    return {
      maxFrame,
      maxCost,
      costHistory: [...state.cost.costHistory],
      actionLogs: actions.records,
      actionEvents: actions.events,
      schedulingDiagnostics: [...actions.diagnostics, ...effects.actionDiagnostics, ...nsScheduler.diagnostics],
      nsScheduling: nsScheduler.result,
      errors,
      effectAudit: [...state.effects.audit, ...state.cards.audit].sort((left, right) => left.frame - right.frame),
      effectLedger: state.effects.ledger,
      window: state.cards.snapshot(),
      finalRuntimes: runtimes,
      finalSummons: state.effects.snapshotSummons(),
    }
  }

  /** 单帧编排：推进子系统状态后处理本帧意图。 */
  private processFrame(
    state: BattleState,
    frame: number,
    baseRegen: number,
    byFrame: Map<number, Intent[]>,
    errors: SimulationError[],
    debt: { current: { studentId: number; skillRef: SkillRef } | null },
  ): void {
    state.frame = frame
    state.actions.advance(frame)
    state.cards.advance(frame)
    state.effects.advance(frame, state.runtimes)
    state.cards.syncRuntime(frame, state.runtimes)
    state.actions.syncControl(frame)
    const costBeforeRegen = state.cost.availableCost
    state.cost.advance(baseRegen + state.effects.getRegenDelta(baseRegen))
    if (costBeforeRegen < 0 && state.cost.availableCost >= 0 && debt.current) {
      state.effects.recordCostDebtRepaid(debt.current.studentId, debt.current.skillRef, frame)
      debt.current = null
    }

    const frameIntents = [...(byFrame.get(frame) ?? [])].sort((a, b) => a.priority - b.priority)
    this.resolveIntents(state, frameIntents, errors, debt)
    state.nsScheduler.observeActions(state.actions.events)
    for (const [slotIndex, runtime] of state.runtimes) {
      const intent = state.nsScheduler.ready(slotIndex, frame, runtime)
      if (!intent) continue
      const actionIndex = state.actions.records.length
      const errorIndex = errors.length
      this.resolveIntents(state, [intent], errors, debt)
      const action = state.actions.records[actionIndex]
      if (action) state.effects.markAutomaticAction(action.recordId)
      state.nsScheduler.settle(slotIndex, frame, action, errors[errorIndex]?.message)
      state.nsScheduler.observeActions(state.actions.events)
    }
  }

  /** Manual and generated intents share the same atomic execution path. */
  private resolveIntents(
    state: BattleState,
    frameIntents: readonly Intent[],
    errors: SimulationError[],
    debt: { current: { studentId: number; skillRef: SkillRef } | null },
  ): void {
    const frame = state.frame
    for (const intent of frameIntents) {
      const ownerSlot = this.resolveSlot(intent.issuerId)
      const ownerRuntime = state.runtimes.get(ownerSlot)
      const ownerStudent = this.students.get(intent.issuerId)
      if (ownerSlot < 0 || !ownerRuntime || !ownerStudent) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'caster is not in formation', type: 'INVALID_TARGET' })
        continue
      }
      const requestedRef = this.intentSkillRef(intent, ownerStudent, this.formation.gearLevels?.[ownerSlot] ?? 1)
      let cardPlan: CardPlayPlan | undefined
      if (intent.type === 'EX_CAST') {
        const prepared = state.cards.preparePlay(ownerSlot, requestedRef, intent)
        if (typeof prepared === 'string') {
          errors.push({
            frame,
            issuerId: intent.issuerId,
            message: prepared,
            type: prepared === 'card_order_violation' ? 'OUT_OF_WINDOW' : 'INVALID_CONDITION',
          })
          continue
        }
        cardPlan = prepared
      }

      const executionSlot = cardPlan?.executorSlot ?? ownerSlot
      const runtime = state.runtimes.get(executionSlot)
      const student = this.students.get(cardPlan?.executorStudentId ?? intent.issuerId)
      const ref = cardPlan?.skillRef ?? requestedRef
      if (!runtime || !student) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'skill executor is not in formation', type: 'INVALID_TARGET' })
        continue
      }
      const executionIntent: Intent = { ...intent, issuerId: student.Id, skillRef: ref }
      const skill = resolveSkill(student, ref, this.getSkillLevels(executionSlot))
      if (!skill) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'skill reference is not available', type: 'INVALID_CONDITION' })
        continue
      }
      // friend-marker 机制：变形技能固定作用于首次选定的目标，并按激活状态选 Buff 数值行。
      const castMechanic = rules.mechanics.cardMechanic(student.Id)
      // friend-marker 机制：基础施放不应用错位的变形 Buff（其数据位于基础 EX Effects）。
      if (castMechanic?.kind === 'friend-marker' && ref.kind === 'ex' && castMechanic.buffStat) {
        skill.effects = skill.effects.filter(effect => !(effect.Type === 'Buff' && effect.Stat === castMechanic.buffStat))
      }
      if (castMechanic?.kind === 'friend-marker'
        && ref.kind === 'extra_ex'
        && castMechanic.transformSkillRef.kind === 'extra_ex'
        && ref.extraSkillId === castMechanic.transformSkillRef.extraSkillId) {
        // 变形技能固定作用于好友槽位（莉音复制时 executorSlot 才是好友机制所有者）。
        const markerSlot = cardPlan?.executorSlot ?? ownerSlot
        const markers = state.cards.markerTargetsOf(markerSlot)
        if (markers.length > 0) {
          const active = state.cards.markerActive(markerSlot)
          executionIntent.targetIds = markers
          if (castMechanic.buffStat && skill.effects.length === 0) {
            const baseBuff = student.Skills.E.Effects.find(effect => effect.Type === 'Buff' && effect.Stat === castMechanic.buffStat)
            if (baseBuff) skill.effects = [baseBuff]
          }
          skill.effects = skill.effects.map(effect => {
            if (effect.Type !== 'Buff' || effect.Stat !== castMechanic.buffStat) return effect
            const rows = effect.Value ?? []
            const counter = castMechanic.counter
            const row = active
              ? (rows[counter?.activeValueRowIndex ?? 1] ?? rows[0])
              : (rows[counter?.baseValueRowIndex ?? 0] ?? rows[1] ?? rows[0])
            return { ...effect, Target: 'Ally', Value: [row] }
          })
        }
      }
      const effectError = state.effects.validate(
        executionIntent,
        skill,
        state.runtimes,
        cardPlan?.allowExtraEx === true,
        cardPlan?.copied === true,
      )
      if (effectError) {
        errors.push({ frame, issuerId: intent.issuerId, message: effectError, type: effectError.includes('target') ? 'INVALID_TARGET' : 'INVALID_CONDITION' })
        continue
      }
      if (runtime.controlledUntil > frame) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'caster is controlled', type: 'COOLDOWN' })
        continue
      }
      if (!Number.isInteger(skill.duration) || skill.duration < 0) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'skill action duration must be a non-negative integer', type: 'INVALID_CONDITION' })
        continue
      }
      if (!isInterruptible(runtime.currentState)) {
        errors.push({ frame, issuerId: intent.issuerId, message: 'caster is executing a non-interruptible action', type: 'COOLDOWN' })
        continue
      }

      const isEx = skill.action === 'EX'
      const baseCost = cardPlan ? state.cards.effectiveBaseCost(cardPlan, skill.cost) : skill.cost
      const cost = state.effects.getEffectiveCost(student.Id, baseCost) * COST_SCALE
      const borrowLimit = state.effects.getCostBorrowLimit(student.Id) * COST_SCALE
      if (isEx && !state.cost.canPay(cost, borrowLimit)) {
        errors.push({ frame, issuerId: intent.issuerId, message: `Cost exceeded at frame ${frame}`, type: 'COST_EXCEEDED' })
        continue
      }
      const actionId = state.actions.startSkill(executionIntent, intent.issuerId, runtime, skill, frame)
      if (isEx) {
        state.cost.pay(cost)
        if (state.cost.availableCost < 0) {
          debt.current = { studentId: student.Id, skillRef: ref }
          state.effects.recordCostDebt(student.Id, ref, frame, state.cost.availableCost / COST_SCALE)
        }
        state.effects.consumeCostModifiers(student.Id, frame)
        if (cardPlan) {
          const cardResult = state.cards.commitPlay(cardPlan, intent, frame)
          // 贝壳只由好友本人成功施放 EX 累加；莉音复制施放不算好友本人施放。
          if (!cardPlan.copied) state.cards.observeMarkerAllyEx(executionSlot, frame)
          for (const hanakoId of cardResult.waterBuffStudentIds) {
            const hanakoSlot = this.resolveSlot(hanakoId)
            const hanako = this.students.get(hanakoId)
            if (hanakoSlot < 0 || !hanako) continue
            const passiveRef: SkillRef = { kind: 'extra_passive' }
            const passive = resolveSkill(hanako, passiveRef, this.getSkillLevels(hanakoSlot))
            if (!passive) continue
            state.effects.schedule({
              id: `water-gauge-${hanakoId}-${frame}`,
              frame,
              type: 'SS_TRIGGER',
              issuerId: hanakoId,
              targetIds: [hanakoId],
              priority: 2,
              skillRef: passiveRef,
              triggerSource: 'automatic',
              trigger: { source: 'automatic' },
            }, passive, frame, state.runtimes)
          }
        }
      }
      state.effects.schedule(executionIntent, skill, frame, state.runtimes, actionId)
      state.actions.advance(frame)
    }
  }

  // ═══════════════════════════════════════════════
  // Tick Pipeline — 各步骤
  // ═══════════════════════════════════════════════


  // ═══════════════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════════════

  private initRuntime(slot: number, studentId: number): StudentRuntimeState {
    return {
      slotIndex: slot,
      studentId,
      currentState: StudentState.IDLE,
      previousState: StudentState.IDLE,
      attackCount: 0,
      ammoRemaining: 0,
      currentActionStartFrame: 0,
      currentActionEndFrame: 0,
      currentShotIndex: 0,
      queuedEx: [],
      controlledUntil: 0,
      phaseTransitionUntil: 0,
      nsTriggered: false,
      specialStacks: {},
      shield: 0,
      summons: {},
    }
  }

  private getExLevel(slot: number): number {
    return this.formation.skillLevels?.[slot] ?? 5
  }

  private getSkillLevels(slot: number): { ex: number; ns: number; ss: number } {
    return {
      ex: this.getExLevel(slot),
      ns: this.formation.publicSkillLevels?.[slot] ?? 10,
      ss: this.formation.passiveSkillLevels?.[slot] ?? 10,
    }
  }

  private intentSkillRef(intent: Intent, student: Student, gearLevel: number): SkillRef {
    if (intent.skillRef) return intent.skillRef
    if (intent.type === 'EX_CAST') return { kind: 'ex' }
    if (intent.type === 'NS_TRIGGER') return gearLevel > 0 && student.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
    return { kind: 'extra_passive' }
  }

  /** 通过 studentId 反查 slotIndex */
  private resolveSlot(studentId: number): number {
    for (let i = 0; i < this.formation.slots.length; i++) {
      if (this.formation.slots[i] === studentId) return i
    }
    return -1
  }

}
