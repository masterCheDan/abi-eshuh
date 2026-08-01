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
import { EX_CARD_RULES } from './exCardRules'

interface SlotCardState {
  overrideRef?: SkillRef
  copiedFromSlot?: number
  copyUses: number
  hinaStage?: number
  hinaExpiresAt?: number
  neruExpiresAt?: number
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
        pinned: false,
      })
      if (formation.slots[slot] === 10074) this.water.set(slot, { gauge: 0, counts: 0 })
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
      if (state.neruExpiresAt != null && state.neruExpiresAt <= frame) {
        state.neruExpiresAt = undefined
        state.overrideRef = undefined
        this.record(frame, slot, { kind: 'ex' }, 'expired', 'transform:timeout')
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
      if (this.formation.slots[slot] !== 10086 || state.hinaExpiresAt == null) continue
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
    if (skillRef.kind === 'extra_ex' && !allowExtraEx && EX_CARD_RULES[ownerStudentId]) {
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
    if (plan.executorStudentId === 10122 && extraId(plan.skillRef) === 'CH0294Ex02') {
      const uses = this.states.get(plan.executorSlot)?.mikaAttackUses ?? 0
      if ((this.states.get(plan.executorSlot)?.mikaRapidExpiresAt ?? 0) > 0) {
        if (uses >= 4) return 10
        if (uses >= 2) return 6
      }
    }
    return Math.max(0, resolvedBaseCost + plan.baseCostAdjustment)
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
    switch (plan.ownerStudentId) {
      case 10074: {
        const gauge = this.water.get(plan.ownerSlot)
        if (gauge && gauge.counts > 0) {
          gauge.counts--
          this.keepInHand(plan.ownerSlot)
          this.record(frame, plan.ownerSlot, plan.skillRef, 'used', `water_count:${gauge.counts}:self_redraw`)
        } else {
          this.consumeNormally(plan.ownerSlot)
        }
        break
      }
      case 10086:
        this.commitDressHina(plan.ownerSlot, skillId, frame)
        break
      case 10111:
        if (skillId === 'CH0280Ex02') {
          this.consumeNormally(plan.ownerSlot)
        } else {
          state.overrideRef = { kind: 'extra_ex', extraSkillId: 'CH0280Ex02' }
          state.neruExpiresAt = frame + 2_100
          this.keepInHand(plan.ownerSlot)
          this.record(frame, plan.ownerSlot, plan.skillRef, 'applied', 'transform:CH0280Ex02:self_redraw')
        }
        break
      case 10122:
        this.commitSwimsuitMika(plan.ownerSlot, skillId, frame)
        break
      case 10134:
        if (skillId === 'CH0334Ex04') {
          state.aliceEnergy = Math.min(2, state.aliceEnergy + 1)
          this.keepInHand(plan.ownerSlot)
          this.record(frame, plan.ownerSlot, plan.skillRef, 'applied', `energy:${state.aliceEnergy}:self_redraw`)
        } else {
          state.aliceEnergy = 0
          this.consumeNormally(plan.ownerSlot)
          if (skillId === 'CH0334Ex01') this.record(frame, plan.ownerSlot, plan.skillRef, 'consumed', 'energy:reset')
        }
        break
      case 16014:
        this.consumeNormally(plan.ownerSlot)
        if (skillId === 'CH0077RidingEx01') {
          this.record(frame, plan.ownerSlot, plan.skillRef, 'applied', 'card_owner:ibuki:executor:toramaru')
        }
        break
      case 20041: {
        this.keepInHand(plan.ownerSlot)
        const targetId = intent.targetIds[0]
        const targetSlot = targetId == null ? -1 : this.resolveSlot(targetId)
        if (targetSlot >= 0) {
          this.pendingCopies.push({ frame: frame + 113, ownerSlot: plan.ownerSlot, sourceSlot: targetSlot })
          this.record(frame, plan.ownerSlot, plan.skillRef, 'scheduled', `copy_at:${frame + 113}:target:${targetId}`)
        }
        break
      }
      default:
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

  private commitDressHina(slot: number, skillId: string | undefined, frame: number): void {
    const state = this.states.get(slot)
    if (!state) return
    const sequence = ['CH0230Ex02', 'CH0230Ex03', 'CH0230Ex04']
    if (skillId === 'CH0230Ex04') {
      state.hinaStage = undefined
      state.hinaExpiresAt = undefined
      state.overrideRef = undefined
      state.pinned = false
      this.consumeNormally(slot)
      this.record(frame, slot, { kind: 'extra_ex', extraSkillId: skillId }, 'consumed', 'fixed_sequence:complete')
      return
    }
    const nextStage = skillId == null ? 0 : sequence.indexOf(skillId) + 1
    if (nextStage < 0 || nextStage >= sequence.length) {
      this.consumeNormally(slot)
      return
    }
    state.hinaStage = nextStage
    state.hinaExpiresAt = frame + 300
    state.overrideRef = { kind: 'extra_ex', extraSkillId: sequence[nextStage] }
    state.pinned = true
    this.keepInHand(slot)
    this.record(frame, slot, state.overrideRef, 'applied', `fixed_sequence:${nextStage + 1}:expires:${state.hinaExpiresAt}`)
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

    switch (plan.executorStudentId) {
      case 10074: {
        const gauge = this.water.get(slot)
        if (!gauge || gauge.counts <= 0) return undefined
        gauge.counts--
        this.record(frame, slot, plan.skillRef, 'used', `water_count:${gauge.counts}:copied_self_redraw`)
        return slot
      }
      case 10086: {
        const sequence = ['CH0230Ex02', 'CH0230Ex03', 'CH0230Ex04']
        if (skillId === 'CH0230Ex04') {
          state.hinaStage = undefined
          state.hinaExpiresAt = undefined
          state.overrideRef = undefined
          state.pinned = false
          this.moveToTail(slot)
          this.record(frame, slot, plan.skillRef, 'consumed', 'fixed_sequence:copied_complete')
          return undefined
        }
        const nextStage = skillId == null ? 0 : sequence.indexOf(skillId) + 1
        if (nextStage >= 0 && nextStage < sequence.length) {
          state.hinaStage = nextStage
          state.hinaExpiresAt = frame + 300
          state.overrideRef = { kind: 'extra_ex', extraSkillId: sequence[nextStage] }
          state.pinned = true
          this.record(frame, slot, state.overrideRef, 'applied', `fixed_sequence:copied:${nextStage + 1}`)
          return slot
        }
        return undefined
      }
      case 10111:
        if (skillId === 'CH0280Ex02') return undefined
        state.overrideRef = { kind: 'extra_ex', extraSkillId: 'CH0280Ex02' }
        state.neruExpiresAt = frame + 2_100
        this.record(frame, slot, plan.skillRef, 'applied', 'transform:copied:CH0280Ex02')
        return slot
      case 10122:
        if (skillId === 'CH0294Ex01') {
          state.mikaRapidExpiresAt = frame + 900
          state.mikaAttackUses = 0
          state.pinned = true
          this.record(frame, slot, plan.skillRef, 'applied', 'rapid_fire:copied_start')
          return slot
        }
        if (skillId === 'CH0294Ex03') {
          state.mikaRapidExpiresAt = undefined
          state.mikaAttackUses = 0
          state.pinned = false
          this.moveToTail(slot)
          this.record(frame, slot, plan.skillRef, 'consumed', 'rapid_fire:copied_end_to_tail')
          return undefined
        }
        if (skillId === 'CH0294Ex02' && state.mikaRapidExpiresAt != null) {
          state.mikaAttackUses++
          state.pinned = true
          this.record(frame, slot, plan.skillRef, 'used', `rapid_fire:copied_attack:${state.mikaAttackUses}`)
          return slot
        }
        return undefined
      case 10134:
        if (skillId === 'CH0334Ex04') {
          state.aliceEnergy = Math.min(2, state.aliceEnergy + 1)
          this.record(frame, slot, plan.skillRef, 'applied', `energy:${state.aliceEnergy}:copied_self_redraw`)
          return slot
        }
        if (skillId === 'CH0334Ex01') {
          state.aliceEnergy = 0
          this.record(frame, slot, plan.skillRef, 'consumed', 'energy:copied_reset')
        }
        return undefined
      default:
        return undefined
    }
  }

  private commitSwimsuitMika(slot: number, skillId: string | undefined, frame: number): void {
    const state = this.states.get(slot)
    if (!state) return
    if (skillId === 'CH0294Ex01') {
      state.mikaRapidExpiresAt = frame + 900
      state.mikaAttackUses = 0
      state.pinned = true
      this.keepInHand(slot)
      this.record(frame, slot, { kind: 'extra_ex', extraSkillId: skillId }, 'applied', `rapid_fire:start:expires:${state.mikaRapidExpiresAt}`)
      return
    }
    if (skillId === 'CH0294Ex03') {
      state.mikaRapidExpiresAt = undefined
      state.mikaAttackUses = 0
      state.pinned = false
      this.consumeNormally(slot)
      this.record(frame, slot, { kind: 'extra_ex', extraSkillId: skillId }, 'consumed', 'rapid_fire:end_to_tail')
      return
    }
    if (skillId === 'CH0294Ex02' && state.mikaRapidExpiresAt != null) {
      state.mikaAttackUses++
      state.pinned = true
      this.keepInHand(slot)
      this.record(frame, slot, { kind: 'extra_ex', extraSkillId: skillId }, 'used', `rapid_fire:attack:${state.mikaAttackUses}:self_redraw`)
      return
    }
    this.consumeNormally(slot)
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
      const sourceRule = executorId == null ? undefined : EX_CARD_RULES[executorId]
      return sourceRule?.extraSkillIds?.includes(id) === true
    }
    if (ownerId === 16014 && id === 'CH0077RidingEx01') {
      return intent.trigger?.source === 'manual' && intent.trigger.reasons?.includes('external_state') === true
    }
    if (ownerId === 10122 || ownerId === 10134) return EX_CARD_RULES[ownerId]?.extraSkillIds?.includes(id) === true
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
      if (hanakoSlot === ownerSlot || state.counts >= 2) continue
      state.gauge += 40
      this.record(frame, hanakoSlot, { kind: 'extra_passive' }, 'applied', `water_gauge:${state.gauge}`)
      if (state.gauge >= 100) {
        state.gauge -= 100
        state.counts = Math.min(2, state.counts + 1)
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
