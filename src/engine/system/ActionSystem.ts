import type { ActionEvent, ActionRecord, EffectAuditRecord, Intent, SchedulingDiagnostic, StudentRuntimeState } from '../model/types'
import { StudentState } from '../model/types'
import type { ResolvedSkill } from './SkillResolver'

/** Successful executions only. No attack timings are inferred from animation data. */
export class ActionSystem {
  readonly records: ActionRecord[] = []
  readonly events: ActionEvent[] = []
  readonly diagnostics: SchedulingDiagnostic[] = []
  private readonly active = new Map<number, ActionRecord>()
  private readonly byId = new Map<string, ActionRecord>()
  private readonly runtimes: Map<number, StudentRuntimeState>
  private readonly onInterrupt: (actionId: string, frame: number) => void

  constructor(
    runtimes: Map<number, StudentRuntimeState>,
    onInterrupt: (actionId: string, frame: number) => void,
  ) {
    this.runtimes = runtimes
    this.onInterrupt = onInterrupt
  }

  startSkill(intent: Intent, ownerId: number, runtime: StudentRuntimeState, skill: ResolvedSkill, frame: number): string {
    this.interrupt(runtime, frame, 'skill:' + skill.action)
    const record = this.start(runtime, skill.action, frame, frame + skill.duration, {
      sourceEventId: intent.id, ownerId, skillRef: skill.ref,
      isManualOverride: intent.trigger?.source === 'manual',
    })
    return record.recordId
  }

  /** Completion wins at the exact end boundary; already applied effects are independent. */
  advance(frame: number): void {
    for (const runtime of this.runtimes.values()) {
      const record = this.active.get(runtime.slotIndex)
      if (record && record.actionType !== 'CC' && record.endFrame <= frame) this.finish(runtime, record, frame)
    }
    this.syncControl(frame)
  }

  syncControl(frame: number): void {
    for (const runtime of this.runtimes.values()) {
      const current = this.active.get(runtime.slotIndex)
      if (runtime.controlledUntil > frame) {
        if (current?.actionType === 'CC') {
          if (current.endFrame !== runtime.controlledUntil) {
            current.endFrame = runtime.controlledUntil
            runtime.currentActionEndFrame = runtime.controlledUntil
            this.emit(current, runtime, frame, 'control_updated')
          }
        } else {
          this.interrupt(runtime, frame, 'control')
          this.start(runtime, 'CC', frame, runtime.controlledUntil)
        }
      } else if (current?.actionType === 'CC') {
        runtime.controlledUntil = 0
        this.finish(runtime, current, frame)
      }
    }
  }

  effectApplied(audit: EffectAuditRecord): void {
    if (!audit.actionId || !['applied', 'ticked'].includes(audit.action)) return
    const record = this.byId.get(audit.actionId)
    const runtime = record && this.runtimes.get(record.slotIndex)
    if (!record || !runtime) return
    record.effectFrame = Math.min(record.effectFrame ?? Infinity, audit.frame)
    this.emit(record, runtime, audit.frame, 'effect_applied', { effectIndex: audit.effectIndex, targetIds: [...audit.targetIds] })
  }

  private start(runtime: StudentRuntimeState, type: 'EX' | 'NS' | 'SS' | 'CC', frame: number, end: number, extra: Partial<ActionRecord> = {}): ActionRecord {
    const record: ActionRecord = {
      recordId: String(this.records.length), studentId: runtime.studentId, slotIndex: runtime.slotIndex,
      actionType: type, startFrame: frame, endFrame: end, plannedEndFrame: end,
      wasInterrupted: false, isManualOverride: false, status: 'running', ...extra,
    }
    this.records.push(record)
    this.active.set(runtime.slotIndex, record)
    this.byId.set(record.recordId, record)
    runtime.previousState = runtime.currentState
    runtime.currentState = type === 'SS' ? StudentState.SS_CAST : StudentState[type]
    runtime.currentActionStartFrame = frame
    runtime.currentActionEndFrame = end
    this.emit(record, runtime, frame, 'started')
    return record
  }

  private finish(runtime: StudentRuntimeState, record: ActionRecord, frame: number): void {
    record.status = 'completed'
    record.endFrame = Math.min(record.endFrame, frame)
    this.active.delete(runtime.slotIndex)
    runtime.previousState = runtime.currentState
    runtime.currentState = StudentState.IDLE
    runtime.currentActionEndFrame = record.endFrame
    this.emit(record, runtime, frame, 'completed')
  }

  private interrupt(runtime: StudentRuntimeState, frame: number, reason: string): void {
    const record = this.active.get(runtime.slotIndex)
    if (!record) return
    // Zero-duration skills can finish before the next same-frame successful intent.
    if (record.endFrame <= frame) { this.finish(runtime, record, frame); return }
    record.status = 'interrupted'
    record.wasInterrupted = true
    record.interruptedAt = frame
    record.endFrame = frame
    this.active.delete(runtime.slotIndex)
    this.emit(record, runtime, frame, 'interrupted', { reason })
    this.onInterrupt(record.recordId, frame)
  }

  private emit(record: ActionRecord, runtime: StudentRuntimeState, frame: number, type: ActionEvent['type'], extra: Partial<ActionEvent> = {}): void {
    this.events.push({ frame, actionId: record.recordId, studentId: runtime.studentId, slotIndex: runtime.slotIndex, type,
      ammoBefore: runtime.ammoRemaining, ammoAfter: runtime.ammoRemaining,
      attackCountBefore: runtime.attackCount, attackCountAfter: runtime.attackCount, ...extra })
  }
}
