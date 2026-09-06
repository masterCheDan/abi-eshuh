import type { Student } from '../../types/student'
import type { ActionEvent, ActionRecord, Formation, Intent, NsScheduleRecord, NsSchedulingConfig, NsSchedulingResult, SchedulingDiagnostic, StudentRuntimeState } from '../model/types'
import { StudentState } from '../model/types'
import { rules } from '../../domain/rules/GameRules'

interface Channel {
  slotIndex: number
  studentId: number
  skillRef: Intent['skillRef']
  periodFrames: number
  nextDue: number
  sequence: number
  pending?: NsScheduleRecord
  stopped: boolean
}

/** Derived events only. A waiting activation occupies one slot and never accumulates. */
export class NsScheduler {
  readonly result: NsSchedulingResult
  readonly diagnostics: SchedulingDiagnostic[] = []
  private readonly channels = new Map<number, Channel>()
  private readonly byActionId = new Map<string, NsScheduleRecord>()
  private eventCursor = 0

  static ruleBindings() { return { 'scheduler.interval': this.prototype.ready } }

  constructor(formation: Formation, students: Map<number, Student>, intents: readonly Intent[], config?: NsSchedulingConfig) {
    rules.nsScheduling.validateConfig(config, formation.slots)
    this.result = { ...(config ? { config: structuredClone(config) } : {}), slots: [], records: [] }
    for (const [slotIndex, studentId] of formation.slots.entries()) {
      if (studentId == null) continue
      const student = students.get(studentId)
      if (!student) continue
      const eligibility = rules.nsScheduling.eligibility(student, formation.gearLevels?.[slotIndex] ?? 1)
      const requestedMode = config?.nsModes[slotIndex] ?? 'manual'
      const hasFacts = intents.some(intent => intent.issuerId === studentId
        && (intent.type === 'NS_TRIGGER' || intent.skillRef?.kind === 'public' || intent.skillRef?.kind === 'gear_public'))
      const conflicts = config?.enabled && requestedMode === 'automatic' && hasFacts
      if (conflicts) eligibility.reasons.push('存在已录入的 NS 事实；需先由用户处理这些事件，才能切换自动模式')
      eligibility.eligible = eligibility.eligible && !conflicts
      const mode = config?.enabled && requestedMode === 'automatic' && eligibility.eligible ? 'automatic' : 'manual'
      this.result.slots.push({ ...eligibility, studentId, slotIndex, requestedMode, mode })
      if (mode === 'automatic') {
        this.channels.set(slotIndex, { slotIndex, studentId, skillRef: eligibility.skillRef,
          periodFrames: eligibility.periodFrames!, nextDue: eligibility.periodFrames!, sequence: 0, stopped: false })
      } else if (config?.enabled && requestedMode === 'automatic') {
        for (const message of eligibility.reasons) this.diagnostics.push({ studentId, code: 'NS_AUTOMATION_BLOCKED', path: `${studentId}:${eligibility.skillRef.kind}`, message })
      }
    }
  }

  /** Call in slot order after user intents; every readiness check sees current runtime state. */
  ready(slotIndex: number, frame: number, runtime: StudentRuntimeState): Intent | undefined {
    const channel = this.channels.get(slotIndex)
    if (!channel || channel.stopped || frame < channel.nextDue) return
    if (!channel.pending) {
      channel.pending = { id: `auto-ns-v${rules.nsScheduling.version}-${slotIndex}-${channel.sequence++}`,
        slotIndex, studentId: channel.studentId, skillRef: channel.skillRef!, triggerFrame: channel.nextDue,
        status: 'waiting', waits: [] }
      this.result.records.push(channel.pending)
    }
    const pending = channel.pending
    const reason = runtime.controlledUntil > frame ? 'control' : runtime.currentState !== StudentState.IDLE ? 'action' : undefined
    const last = pending.waits.at(-1)
    if (reason) {
      if (last?.endFrame == null && last?.reason === reason) return
      if (last && last.endFrame == null) last.endFrame = frame
      pending.waits.push({ startFrame: frame, reason })
      return
    }
    if (last && last.endFrame == null) last.endFrame = frame
    return { id: pending.id, frame, issuerId: channel.studentId, targetIds: [channel.studentId],
      type: 'NS_TRIGGER', skillRef: channel.skillRef, priority: 2,
      triggerSource: 'automatic', trigger: { source: 'automatic' } }
  }

  settle(slotIndex: number, frame: number, action: ActionRecord | undefined, error?: string): void {
    const channel = this.channels.get(slotIndex)
    const pending = channel?.pending
    if (!channel || !pending) return
    if (action) {
      pending.status = 'executed'
      pending.castFrame = frame
      pending.actionId = action.recordId
      action.nsScheduleId = pending.id
      action.triggerFrame = pending.triggerFrame
      this.byActionId.set(action.recordId, pending)
    } else {
      pending.status = 'rejected'
      pending.message = error ?? '自动 NS 未通过引擎施放校验'
      this.diagnostics.push({ studentId: channel.studentId, frame, code: 'AUTO_NS_REJECTED', path: `${channel.studentId}:${channel.skillRef?.kind}`, message: pending.message })
    }
    // One rejected activation also consumes that scheduler attempt, never a frame-by-frame retry.
    channel.nextDue = frame + channel.periodFrames
    channel.pending = undefined
  }

  observeActions(events: readonly ActionEvent[]): void {
    for (; this.eventCursor < events.length; this.eventCursor++) {
      const event = events[this.eventCursor]
      if (event.type !== 'interrupted') continue
      const record = this.byActionId.get(event.actionId)
      const channel = record && this.channels.get(record.slotIndex)
      if (!record || !channel) continue
      record.status = 'interrupted'
      record.message = '自动 NS 被中断；后续自动触发需重新确认，已生效状态保留'
      channel.stopped = true
      this.diagnostics.push({ studentId: record.studentId, frame: event.frame, actionId: event.actionId,
        code: 'AUTO_NS_INTERRUPTED', path: `${record.studentId}:${record.skillRef.kind}`, message: record.message })
    }
  }

  finish(maxFrame: number): void {
    for (const record of this.result.records) {
      const last = record.waits.at(-1)
      if (last && last.endFrame == null) last.endFrame = maxFrame
    }
  }
}
