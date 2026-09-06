import type { Student } from '../../types/student'
import type {
  CardOrderSnapshot,
  CardStateSnapshot,
  EffectAuditRecord,
  Formation,
  Intent,
  SkillRef,
  StudentRuntimeState,
} from '../model/types'
import { rules } from '../../domain/rules/GameRules'
import type { CardMechanicState, CardPlayContext } from '../../domain/rules/GameRules'

interface SlotCardState {
  overrideRef?: SkillRef
  copiedFromSlot?: number
  copyUses: number
  hinaStage?: number
  hinaExpiresAt?: number
  /** 机制驱动的卡面变换超时（transform mechanic）。 */
  mechanicExpiresAt?: number
  mechanicTailOnExpiry?: boolean
  /** friend-marker 机制：首次施放选定的目标槽位。 */
  markerTargets: number[]
  markerCount: number
  markerActive: boolean
  mikaRapidExpiresAt?: number
  mikaAttackUses: number
  aliceEnergy: number
  pinned: boolean
}

interface PendingCopy {
  frame: number
  ownerSlot: number
  sourceSlot: number
}

interface WaterGaugeState {
  gauge: number
  counts: number
}

export interface CardPlayPlan {
  ownerSlot: number
  ownerStudentId: number
  executorSlot: number
  executorStudentId: number
  skillRef: SkillRef
  requestedRef: SkillRef
  copied: boolean
  baseCostAdjustment: number
  allowExtraEx: boolean
}

export interface CardPlayResult {
  /** Students whose water gauge reached 100% because of this successful EX. */
  waterBuffStudentIds: number[]
}

/** 莉音复制路径（applyCopiedExecutorState）中 copied 行为执行时的上下文。 */
interface CopiedCardPlayContext {
  slot: number
  studentId: number
  skillId: string | undefined
  skillRef: SkillRef
  frame: number
  state: CardMechanicState
  record(skillRef: SkillRef, action: EffectAuditRecord['action'], detail: string): void
  moveToTail(): void
}

function extraId(ref: SkillRef): string | undefined {
  return ref.kind === 'extra_ex' ? ref.extraSkillId : undefined
}

function sameSkillRef(left: SkillRef, right: SkillRef): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind !== 'extra_ex' || right.kind !== 'extra_ex') return true
  return left.extraSkillId != null || right.extraSkillId != null
    ? left.extraSkillId === right.extraSkillId
    : left.extraSkillIndex === right.extraSkillIndex
}

/**
 * 用户未自定义初始牌序时的贪心推断：
 * 按 EX 施放者的首次施放帧排序（同帧按 slotIndex 兜底），
 * 再按编队顺序补全未施放的在编槽位，得到完整初始牌库。
 *
 * 贪心最优性：前 windowSize 个不同施放者恰好构成初始手牌，首施放必合法；
 * 重复施放合法性与初始牌序无关（队列模型下固定需要 N−windowSize 次间隔），
 * 因此该牌库既不会放过真实非法序列，也不会误伤合法序列。
 */
export function inferGreedyDeck(slots: Array<number | null>, intents: Intent[]): number[] {
  const firstFrame = new Map<number, number>()
  for (const intent of intents) {
    if (intent.type !== 'EX_CAST') continue
    const slot = slots.indexOf(intent.issuerId)
    if (slot < 0) continue
    const prev = firstFrame.get(slot)
    if (prev == null || intent.frame < prev) firstFrame.set(slot, intent.frame)
  }
  const ordered = [...firstFrame.entries()]
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
    .map(([slot]) => slot)
  const occupied = slots.flatMap((studentId, slot) => studentId == null ? [] : [slot])
  return [...ordered, ...occupied.filter(slot => !firstFrame.has(slot))]
}

/**
 * Deterministic hand/draw-pile runtime.
 *
 * `deckOrder` is the configured initial order. Missing occupied slots are
 * appended in formation order so an unfinished editor state still produces a
 * complete, reproducible deck.
 */
export class CardOrderSystem {
  private readonly formation: Formation
  private readonly students: Map<number, Student>
  private readonly enabled: boolean
  private readonly windowSize: number
  private readonly initialDeck: number[]
  private readonly states = new Map<number, SlotCardState>()
  private readonly water = new Map<number, WaterGaugeState>()
  private readonly pendingCopies: PendingCopy[] = []
  private hand: number[]
  private drawPile: number[]
  private playCount = 0
  readonly audit: EffectAuditRecord[] = []

  constructor(formation: Formation, students: Map<number, Student>) {
    this.formation = formation
    this.students = students
    this.enabled = formation.deckOrder != null
    this.windowSize = formation.mode === 'normal' ? 3 : 5

    const occupied = formation.slots.flatMap((studentId, slot) => studentId == null ? [] : [slot])
    const configured = (formation.deckOrder ?? []).filter((slot, index, order) =>
      occupied.includes(slot) && order.indexOf(slot) === index)
    this.initialDeck = [...configured, ...occupied.filter(slot => !configured.includes(slot))]
    this.hand = this.enabled ? this.initialDeck.slice(0, this.windowSize) : []
    this.drawPile = this.enabled ? this.initialDeck.slice(this.windowSize) : []

    for (const slot of occupied) {
      this.states.set(slot, {
        copyUses: 0,
        mikaAttackUses: 0,
        aliceEnergy: 0,
        markerTargets: [],
        markerCount: 0,
        markerActive: false,
        pinned: false,
      })
      const mechanic = rules.mechanics.cardMechanic(formation.slots[slot] ?? -1)
      if (mechanic?.kind === 'behavior' && mechanic.waterGauge) {
        this.water.set(slot, { gauge: 0, counts: 0 })
      }
    }
  }

  advance(frame: number): void {
    const copies = this.pendingCopies.filter(item => item.frame <= frame)
    this.pendingCopies.splice(0, this.pendingCopies.length, ...this.pendingCopies.filter(item => item.frame > frame))
    for (const copy of copies) {
      const state = this.states.get(copy.ownerSlot)
      const sourceId = this.formation.slots[copy.sourceSlot]
      if (!state || sourceId == null) continue
      state.copiedFromSlot = copy.sourceSlot
      state.copyUses = 1
      this.record(frame, copy.ownerSlot, { kind: 'ex' }, 'applied', `copy:${sourceId}`)
    }

    for (const [slot, state] of this.states) {
      if (state.hinaExpiresAt != null && state.hinaExpiresAt <= frame) {
        state.hinaExpiresAt = undefined
        state.hinaStage = undefined
        state.overrideRef = undefined
        state.pinned = false
        this.moveToTail(slot)
        this.record(frame, slot, { kind: 'ex' }, 'expired', 'fixed_sequence:timeout')
      }
      if (state.mechanicExpiresAt != null && state.mechanicExpiresAt <= frame) {
        state.mechanicExpiresAt = undefined
        state.overrideRef = undefined
        if (state.mechanicTailOnExpiry) {
          state.mechanicTailOnExpiry = false
          this.moveToTail(slot)
          this.record(frame, slot, { kind: 'ex' }, 'expired', 'transform:timeout_to_tail')
        } else {
          this.record(frame, slot, { kind: 'ex' }, 'expired', 'transform:timeout')
        }
      }
      if (state.mikaRapidExpiresAt != null && state.mikaRapidExpiresAt <= frame) {
        state.mikaRapidExpiresAt = undefined
        state.mikaAttackUses = 0
        state.pinned = false
        this.moveToTail(slot)
        this.record(frame, slot, { kind: 'ex' }, 'expired', 'rapid_fire:timeout_to_tail')
      }
    }
  }

  /** Some card states end from structured runtime events rather than time. */
  syncRuntime(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    for (const [slot, state] of this.states) {
      const mechanic = rules.mechanics.cardMechanic(this.formation.slots[slot] ?? -1)
      if (mechanic?.kind !== 'behavior' || !mechanic.ccInterruptsSequence || state.hinaExpiresAt == null) continue
      const runtime = runtimes.get(slot)
      if (!runtime || runtime.controlledUntil <= frame) continue
      state.hinaExpiresAt = undefined
      state.hinaStage = undefined
      state.overrideRef = undefined
      state.pinned = false
      this.moveToTail(slot)
      this.record(frame, slot, { kind: 'ex' }, 'expired', 'fixed_sequence:ended_by_cc')
    }
  }

  preparePlay(ownerSlot: number, requestedRef: SkillRef, intent: Intent): CardPlayPlan | string {
    const ownerStudentId = this.formation.slots[ownerSlot]
    const ownerState = this.states.get(ownerSlot)
    if (ownerStudentId == null || !ownerState) return 'card owner is not in formation'
    if (this.enabled && !this.hand.includes(ownerSlot)) return 'card_order_violation'

    let executorSlot = ownerSlot
    let executorStudentId = ownerStudentId
    let skillRef = requestedRef
    let copied = false
    let baseCostAdjustment = 0

    if (ownerState.copiedFromSlot != null && ownerState.copyUses > 0) {
      const sourceId = this.formation.slots[ownerState.copiedFromSlot]
      if (sourceId == null) return 'copied card source left the formation'
      executorSlot = ownerState.copiedFromSlot
      executorStudentId = sourceId
      copied = true
      baseCostAdjustment = -1
      skillRef = requestedRef.kind === 'ex'
        ? this.currentSkillRef(executorSlot)
        : requestedRef
    } else if (ownerState.overrideRef) {
      if (requestedRef.kind === 'ex') {
        skillRef = ownerState.overrideRef
      } else if (!sameSkillRef(requestedRef, ownerState.overrideRef)) {
        return `card state requires ${extraId(ownerState.overrideRef) ?? ownerState.overrideRef.kind}`
      }
    }

    const allowExtraEx = this.allowsExtraEx(ownerSlot, executorSlot, skillRef, intent, copied)
    if (skillRef.kind === 'extra_ex' && !allowExtraEx && rules.card.has(ownerStudentId)) {
      return 'extra EX is not available in the current card state'
    }

    return {
      ownerSlot,
      ownerStudentId,
      executorSlot,
      executorStudentId,
      skillRef,
      requestedRef,
      copied,
      baseCostAdjustment,
      allowExtraEx,
    }
  }

  effectiveBaseCost(plan: CardPlayPlan, resolvedBaseCost: number): number {
    const mechanic = rules.mechanics.cardMechanic(plan.executorStudentId)
    const escalation = mechanic?.kind === 'behavior' ? mechanic.costEscalation : undefined
    if (escalation && extraId(plan.skillRef) === escalation.skillId) {
      const uses = this.states.get(plan.executorSlot)?.mikaAttackUses ?? 0
      if ((this.states.get(plan.executorSlot)?.mikaRapidExpiresAt ?? 0) > 0) {
        let escalated: number | undefined
        for (const tier of escalation.tiers) {
          if (uses >= tier.minUses) escalated = tier.cost
        }
        if (escalated != null) return escalated
      }
    }
    return Math.max(0, resolvedBaseCost + plan.baseCostAdjustment)
  }

  /** behavior 机制的处理器（单一注册位置，按 behaviorId 分发）。 */
  private readonly behaviorHandlers: Readonly<Record<string, (ctx: CardPlayContext) => void>> = {
    'water-gauge': (ctx) => {
      const counts = ctx.waterCounts(ctx.slot)
      if (counts != null && counts > 0) {
        ctx.spendWaterCount(ctx.slot)
        ctx.keepInHand()
        ctx.record(ctx.skillRef, 'used', `water_count:${counts - 1}:self_redraw`)
      } else {
        ctx.consumeNormally()
      }
    },
    'fixed-sequence': (ctx) => {
      const sequence = ['CH0230Ex02', 'CH0230Ex03', 'CH0230Ex04']
      if (ctx.skillId === 'CH0230Ex04') {
        ctx.state.hinaStage = undefined
        ctx.state.hinaExpiresAt = undefined
        ctx.state.overrideRef = undefined
        ctx.state.pinned = false
        ctx.consumeNormally()
        ctx.record({ kind: 'extra_ex', extraSkillId: ctx.skillId }, 'consumed', 'fixed_sequence:complete')
        return
      }
      const nextStage = ctx.skillId == null ? 0 : sequence.indexOf(ctx.skillId) + 1
      if (nextStage < 0 || nextStage >= sequence.length) {
        ctx.consumeNormally()
        return
      }
      ctx.state.hinaStage = nextStage
      ctx.state.hinaExpiresAt = ctx.frame + 300
      ctx.state.overrideRef = { kind: 'extra_ex', extraSkillId: sequence[nextStage] }
      ctx.state.pinned = true
      ctx.keepInHand()
      ctx.record(ctx.state.overrideRef, 'applied', `fixed_sequence:${nextStage + 1}:expires:${ctx.state.hinaExpiresAt}`)
    },
    'rapid-fire': (ctx) => {
      if (ctx.skillId === 'CH0294Ex01') {
        ctx.state.mikaRapidExpiresAt = ctx.frame + 900
        ctx.state.mikaAttackUses = 0
        ctx.state.pinned = true
        ctx.keepInHand()
        ctx.record({ kind: 'extra_ex', extraSkillId: ctx.skillId }, 'applied', `rapid_fire:start:expires:${ctx.state.mikaRapidExpiresAt}`)
        return
      }
      if (ctx.skillId === 'CH0294Ex03') {
        ctx.state.mikaRapidExpiresAt = undefined
        ctx.state.mikaAttackUses = 0
        ctx.state.pinned = false
        ctx.consumeNormally()
        ctx.record({ kind: 'extra_ex', extraSkillId: ctx.skillId }, 'consumed', 'rapid_fire:end_to_tail')
        return
      }
      if (ctx.skillId === 'CH0294Ex02' && ctx.state.mikaRapidExpiresAt != null) {
        ctx.state.mikaAttackUses++
        ctx.state.pinned = true
        ctx.keepInHand()
        ctx.record({ kind: 'extra_ex', extraSkillId: ctx.skillId }, 'used', `rapid_fire:attack:${ctx.state.mikaAttackUses}:self_redraw`)
        return
      }
      ctx.consumeNormally()
    },
    'charge-attack': (ctx) => {
      if (ctx.skillId === 'CH0334Ex04') {
        ctx.state.aliceEnergy = Math.min(2, ctx.state.aliceEnergy + 1)
        ctx.keepInHand()
        ctx.record(ctx.skillRef, 'applied', `energy:${ctx.state.aliceEnergy}:self_redraw`)
      } else {
        ctx.state.aliceEnergy = 0
        ctx.consumeNormally()
        if (ctx.skillId === 'CH0334Ex01') ctx.record(ctx.skillRef, 'consumed', 'energy:reset')
      }
    },
    'riding-executor': (ctx) => {
      ctx.consumeNormally()
      if (ctx.skillId === 'CH0077RidingEx01') {
        ctx.record(ctx.skillRef, 'applied', 'card_owner:ibuki:executor:toramaru')
      }
    },
    'copy-target': (ctx) => {
      ctx.keepInHand()
      const targetId = ctx.targetIds[0]
      const targetSlot = targetId == null ? -1 : ctx.resolveSlot(targetId)
      if (targetSlot >= 0) {
        ctx.pushPendingCopy(targetSlot, ctx.frame + 113)
        ctx.record(ctx.skillRef, 'scheduled', `copy_at:${ctx.frame + 113}:target:${targetId}`)
      }
    },
  }

  /** copied 行为（莉音复制路径）的处理器，返回首选手牌位（通常为被复制者槽位）。 */
  private readonly copiedBehaviorHandlers: Readonly<Record<string, (ctx: CopiedCardPlayContext) => number | undefined>> = {
    'water-gauge-copied': (ctx) => {
      const gauge = this.water.get(ctx.slot)
      if (!gauge || gauge.counts <= 0) return undefined
      gauge.counts--
      ctx.record(ctx.skillRef, 'used', `water_count:${gauge.counts}:copied_self_redraw`)
      return ctx.slot
    },
    'fixed-sequence-copied': (ctx) => {
      const sequence = ['CH0230Ex02', 'CH0230Ex03', 'CH0230Ex04']
      if (ctx.skillId === 'CH0230Ex04') {
        ctx.state.hinaStage = undefined
        ctx.state.hinaExpiresAt = undefined
        ctx.state.overrideRef = undefined
        ctx.state.pinned = false
        ctx.moveToTail()
        ctx.record({ kind: 'extra_ex', extraSkillId: ctx.skillId }, 'consumed', 'fixed_sequence:copied_complete')
        return undefined
      }
      const nextStage = ctx.skillId == null ? 0 : sequence.indexOf(ctx.skillId) + 1
      if (nextStage >= 0 && nextStage < sequence.length) {
        ctx.state.hinaStage = nextStage
        ctx.state.hinaExpiresAt = ctx.frame + 300
        ctx.state.overrideRef = { kind: 'extra_ex', extraSkillId: sequence[nextStage] }
        ctx.state.pinned = true
        ctx.record(ctx.state.overrideRef, 'applied', `fixed_sequence:copied:${nextStage + 1}`)
        return ctx.slot
      }
      return undefined
    },
    'transform-copied': (ctx) => {
      if (ctx.skillId === 'CH0280Ex02') return undefined
      ctx.state.overrideRef = { kind: 'extra_ex', extraSkillId: 'CH0280Ex02' }
      ctx.state.mechanicExpiresAt = ctx.frame + 2_100
      ctx.state.mechanicTailOnExpiry = false
      ctx.record(ctx.skillRef, 'applied', 'transform:copied:CH0280Ex02')
      return ctx.slot
    },
    'rapid-fire-copied': (ctx) => {
      if (ctx.skillId === 'CH0294Ex01') {
        ctx.state.mikaRapidExpiresAt = ctx.frame + 900
        ctx.state.mikaAttackUses = 0
        ctx.state.pinned = true
        ctx.record(ctx.skillRef, 'applied', 'rapid_fire:copied_start')
        return ctx.slot
      }
      if (ctx.skillId === 'CH0294Ex03') {
        ctx.state.mikaRapidExpiresAt = undefined
        ctx.state.mikaAttackUses = 0
        ctx.state.pinned = false
        ctx.moveToTail()
        ctx.record(ctx.skillRef, 'consumed', 'rapid_fire:copied_end_to_tail')
        return undefined
      }
      if (ctx.skillId === 'CH0294Ex02' && ctx.state.mikaRapidExpiresAt != null) {
        ctx.state.mikaAttackUses++
        ctx.state.pinned = true
        ctx.record(ctx.skillRef, 'used', `rapid_fire:copied_attack:${ctx.state.mikaAttackUses}`)
        return ctx.slot
      }
      return undefined
    },
    'charge-attack-copied': (ctx) => {
      if (ctx.skillId === 'CH0334Ex04') {
        ctx.state.aliceEnergy = Math.min(2, ctx.state.aliceEnergy + 1)
        ctx.record(ctx.skillRef, 'applied', `energy:${ctx.state.aliceEnergy}:copied_self_redraw`)
        return ctx.slot
      }
      if (ctx.skillId === 'CH0334Ex01') {
        ctx.state.aliceEnergy = 0
        ctx.record(ctx.skillRef, 'consumed', 'energy:copied_reset')
      }
      return undefined
    },
  }

  private playContext(
    plan: CardPlayPlan,
    intent: Intent,
    frame: number,
    state: SlotCardState,
    skillId: string | undefined,
  ): CardPlayContext {
    return {
      slot: plan.ownerSlot,
      studentId: plan.ownerStudentId,
      skillId,
      skillRef: plan.skillRef,
      targetIds: intent.targetIds,
      frame,
      state: state as unknown as CardMechanicState,
      keepInHand: () => this.keepInHand(plan.ownerSlot),
      consumeNormally: (preferredDrawSlot?: number) => this.consumeNormally(plan.ownerSlot, preferredDrawSlot),
      moveToTail: () => this.moveToTail(plan.ownerSlot),
      record: (skillRef, action, detail) => this.record(frame, plan.ownerSlot, skillRef, action, detail),
      resolveSlot: (studentId) => this.resolveSlot(studentId),
      pushPendingCopy: (sourceSlot, atFrame) => this.pendingCopies.push({ frame: atFrame, ownerSlot: plan.ownerSlot, sourceSlot }),
      waterCounts: (slot) => this.water.get(slot)?.counts,
      spendWaterCount: (slot) => {
        const gauge = this.water.get(slot)
        if (!gauge || gauge.counts <= 0) return false
        gauge.counts--
        return true
      },
    }
  }

  commitPlay(plan: CardPlayPlan, intent: Intent, frame: number): CardPlayResult {
    this.playCount++
    const state = this.states.get(plan.ownerSlot)
    if (!state) return { waterBuffStudentIds: [] }

    if (plan.copied) {
      state.copiedFromSlot = undefined
      state.copyUses = 0
      const preferredDrawSlot = this.applyCopiedExecutorState(plan, frame)
      this.consumeNormally(plan.ownerSlot, preferredDrawSlot)
      this.record(frame, plan.ownerSlot, plan.skillRef, 'consumed', 'copy:used_and_reverted')
      return { waterBuffStudentIds: this.observeTeamEx(plan.executorSlot, frame) }
    }

    const skillId = extraId(plan.skillRef)
    const mechanic = rules.mechanics.cardMechanic(plan.ownerStudentId)
    if (mechanic?.kind === 'friend-marker') {
      const transformId = extraId(mechanic.transformSkillRef)
      if (skillId === transformId) {
        this.consumeNormally(plan.ownerSlot)
      } else {
        state.markerTargets = intent.targetIds
          .map(id => this.formation.slots.indexOf(id))
          .filter(slot => slot >= 0)
        state.overrideRef = mechanic.transformSkillRef
        this.keepInHand(plan.ownerSlot)
        this.record(frame, plan.ownerSlot, plan.skillRef, 'applied', `markers:${state.markerTargets.join(',')}:transform:${transformId}:self_redraw:permanent`)
      }
    } else if (mechanic?.kind === 'transform') {
      const transformId = extraId(mechanic.transformSkillRef)
      if (skillId === transformId) {
        this.consumeNormally(plan.ownerSlot)
      } else {
        state.overrideRef = mechanic.transformSkillRef
        if (mechanic.expiresAfter != null) {
          state.mechanicExpiresAt = frame + mechanic.expiresAfter
          state.mechanicTailOnExpiry = mechanic.moveToTailOnExpiry ?? false
        }
        if (mechanic.selfRedraw) this.keepInHand(plan.ownerSlot)
        this.record(frame, plan.ownerSlot, plan.skillRef, 'applied', `transform:${transformId}:self_redraw:${mechanic.expiresAfter == null ? 'permanent' : `expires:${state.mechanicExpiresAt}`}`)
      }
    } else if (mechanic?.kind === 'behavior') {
      const handler = this.behaviorHandlers[mechanic.behaviorId]
      if (handler) handler(this.playContext(plan, intent, frame, state, skillId))
    } else {
      this.consumeNormally(plan.ownerSlot)
    }

    return { waterBuffStudentIds: this.observeTeamEx(plan.ownerSlot, frame) }
  }

  snapshot(): CardOrderSnapshot | undefined {
    if (!this.enabled) return undefined
    return {
      left: this.playCount,
      size: this.windowSize,
      deck: [...this.initialDeck],
      hand: this.hand.map(slot => this.snapshotCard(slot)),
      drawPile: this.drawPile.map(slot => this.snapshotCard(slot)),
    }
  }

  /** friend-marker 机制：被标记目标的学生 ID。 */
  markerTargetsOf(slot: number): number[] {
    const state = this.states.get(slot)
    if (!state) return []
    return state.markerTargets
      .map(markerSlot => this.formation.slots[markerSlot])
      .filter((id): id is number => id != null)
  }

  /** friend-marker 机制：是否已激活（开花）。 */
  markerActive(slot: number): boolean {
    return this.states.get(slot)?.markerActive ?? false
  }

  /** 被标记目标成功施放 EX：按配置计数，达到阈值后激活并停止累加。 */
  observeMarkerAllyEx(targetSlot: number, frame: number): void {
    for (const [slot, state] of this.states) {
      const mechanic = rules.mechanics.cardMechanic(this.formation.slots[slot] ?? -1)
      if (mechanic?.kind !== 'friend-marker' || state.markerActive) continue
      if (!state.markerTargets.includes(targetSlot)) continue
      const counter = mechanic.counter
      if (!counter) continue
      state.markerCount += counter.gainPerEx
      if (state.markerCount >= counter.threshold) {
        this.record(frame, slot, { kind: 'ex' }, 'applied', `marker_count:${state.markerCount}`)
        state.markerActive = true
        state.markerCount = 0
        this.record(frame, slot, { kind: 'ex' }, 'applied', 'marker_active')
      } else {
        this.record(frame, slot, { kind: 'ex' }, 'applied', `marker_count:${state.markerCount}`)
      }
    }
  }

  /**
   * A Rio copy keeps Rio as the consumed card, but the copied student's skill
   * state still changes. Explicit self-redraws use Rio's newly opened hand
   * position, so hand size remains constant.
   */
  private applyCopiedExecutorState(plan: CardPlayPlan, frame: number): number | undefined {
    const slot = plan.executorSlot
    const state = this.states.get(slot)
    if (!state) return undefined
    const skillId = extraId(plan.skillRef)

    const mechanic = rules.mechanics.cardMechanic(plan.executorStudentId)
    const copiedId = mechanic?.copiedBehaviorId
    if (copiedId == null) return undefined
    const handler = this.copiedBehaviorHandlers[copiedId]
    if (!handler) return undefined
    return handler({
      slot,
      studentId: plan.executorStudentId,
      skillId,
      skillRef: plan.skillRef,
      frame,
      state: state as unknown as CardMechanicState,
      record: (skillRef, action, detail) => this.record(frame, slot, skillRef, action, detail),
      moveToTail: () => this.moveToTail(slot),
    })
  }

  private allowsExtraEx(
    ownerSlot: number,
    executorSlot: number,
    ref: SkillRef,
    intent: Intent,
    copied: boolean,
  ): boolean {
    if (ref.kind !== 'extra_ex') return false
    const ownerId = this.formation.slots[ownerSlot]
    const executorId = this.formation.slots[executorSlot]
    const id = extraId(ref)
    if (id == null) return false

    if (copied) {
      const sourceRule = executorId == null ? undefined : rules.card.get(executorId)
      return sourceRule?.extraSkillIds?.includes(id) === true
    }
    if (ownerId == null) return false
    const ownerMechanic = rules.mechanics.cardMechanic(ownerId)
    if (ownerMechanic?.kind === 'behavior') {
      if (ownerMechanic.allowExtraExFromRule) {
        return rules.card.get(ownerId)?.extraSkillIds?.includes(id) === true
      }
      if (ownerMechanic.externalTriggerSkillIds?.includes(id) === true) {
        return intent.trigger?.source === 'manual' && intent.trigger.reasons?.includes('external_state') === true
      }
    }
    const override = this.states.get(ownerSlot)?.overrideRef
    return override != null && sameSkillRef(override, ref)
  }

  private currentSkillRef(slot: number): SkillRef {
    const state = this.states.get(slot)
    if (!state) return { kind: 'ex' }
    if (state.copiedFromSlot != null && state.copyUses > 0) return this.currentSkillRef(state.copiedFromSlot)
    return state.overrideRef ?? { kind: 'ex' }
  }

  private observeTeamEx(ownerSlot: number, frame: number): number[] {
    const buffStudents: number[] = []
    for (const [hanakoSlot, state] of this.water) {
      const mechanic = rules.mechanics.cardMechanic(this.formation.slots[hanakoSlot] ?? -1)
      const waterGauge = mechanic?.kind === 'behavior' ? mechanic.waterGauge : undefined
      if (!waterGauge || hanakoSlot === ownerSlot || state.counts >= waterGauge.maxCounts) continue
      state.gauge += waterGauge.gainPerTeamEx
      this.record(frame, hanakoSlot, { kind: 'extra_passive' }, 'applied', `water_gauge:${state.gauge}`)
      if (state.gauge >= 100) {
        state.gauge -= 100
        state.counts = Math.min(waterGauge.maxCounts, state.counts + 1)
        const studentId = this.formation.slots[hanakoSlot]
        if (studentId != null) buffStudents.push(studentId)
        this.record(frame, hanakoSlot, { kind: 'extra_passive' }, 'applied', `water_count:${state.counts}`)
      }
    }
    return buffStudents
  }

  private keepInHand(slot: number): void {
    if (!this.enabled || this.hand.includes(slot)) return
    const queueIndex = this.drawPile.indexOf(slot)
    if (queueIndex >= 0) this.drawPile.splice(queueIndex, 1)
    this.hand.push(slot)
  }

  private consumeNormally(slot: number, preferredDrawSlot?: number): void {
    if (!this.enabled) return
    const handIndex = this.hand.indexOf(slot)
    if (handIndex < 0) return
    this.hand.splice(handIndex, 1)
    const oldQueueIndex = this.drawPile.indexOf(slot)
    if (oldQueueIndex >= 0) this.drawPile.splice(oldQueueIndex, 1)
    this.drawPile.push(slot)
    const preferredIndex = preferredDrawSlot == null ? -1 : this.drawPile.indexOf(preferredDrawSlot)
    const next = preferredIndex >= 0
      ? this.drawPile.splice(preferredIndex, 1)[0]
      : this.drawPile.shift()
    if (next != null) this.hand.splice(Math.min(handIndex, this.hand.length), 0, next)
  }

  private moveToTail(slot: number): void {
    if (!this.enabled) return
    const handIndex = this.hand.indexOf(slot)
    if (handIndex >= 0) this.hand.splice(handIndex, 1)
    const queueIndex = this.drawPile.indexOf(slot)
    if (queueIndex >= 0) this.drawPile.splice(queueIndex, 1)
    this.drawPile.push(slot)
    if (handIndex >= 0) {
      const next = this.drawPile.shift()
      if (next != null) this.hand.splice(Math.min(handIndex, this.hand.length), 0, next)
    }
  }

  private snapshotCard(slot: number): CardStateSnapshot {
    const studentId = this.formation.slots[slot] ?? -1
    const state = this.states.get(slot)
    const gauge = this.water.get(slot)
    return {
      slotIndex: slot,
      studentId,
      skillRef: this.currentSkillRef(slot),
      copiedFromSlot: state?.copiedFromSlot,
      pinned: state?.pinned ?? false,
      labels: [
        ...(gauge ? [`water:${gauge.gauge}/${gauge.counts}`] : []),
        ...(state?.aliceEnergy ? [`energy:${state.aliceEnergy}`] : []),
        ...(state?.mikaRapidExpiresAt != null ? [`rapid:${state.mikaAttackUses}`] : []),
      ],
    }
  }

  private resolveSlot(studentId: number): number {
    return this.formation.slots.indexOf(studentId)
  }

  private record(
    frame: number,
    slot: number,
    skillRef: SkillRef,
    action: EffectAuditRecord['action'],
    detail: string,
  ): void {
    const studentId = this.formation.slots[slot]
    if (studentId == null || !this.students.has(studentId)) return
    this.audit.push({
      frame,
      issuerId: studentId,
      targetIds: [studentId],
      skillRef,
      effectIndex: -1,
      effectType: 'CardOrder',
      action,
      detail,
    })
  }
}
