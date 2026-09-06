/**
 * StudentEffectSystem：效果系统门面（Facade）。
 *
 * 职责已拆分：
 * - SkillResolver：技能是什么
 * - SkillValidator：技能能否执行
 * - EffectScheduler：何时生效（入队）
 * - EffectExecutor：生效后改变什么（应用/到期/召唤/Cost 查询）
 *
 * 本类只负责组装与暴露统一入口，所有状态存放在共享的 EffectRuntimeState。
 */
import type { Student } from '../../types/student'
import type { BattleEnv, EffectAuditRecord, EffectLedgerEntry, Formation, Intent, SchedulingDiagnostic, SkillRef, StudentRuntimeState, SummonInstance } from '../model/types'
import { EffectExecutor } from './EffectExecutor'
import { EffectScheduler } from './EffectScheduler'
import { SkillValidator } from './SkillValidator'
import type { EffectRuntimeState } from './effectRuntime'
import type { ResolvedSkill } from './SkillResolver'

export class StudentEffectSystem {
  private readonly state: EffectRuntimeState = {
    active: [],
    pending: [],
    pendingSummons: [],
    summons: [],
    cycleCursor: new Map(),
    castCounts: new Map(),
    decayNext: new Map(),
    layerGrantProgress: new Map(),
    nextId: 1,
    audit: [],
    ledger: [],
  }
  readonly audit: EffectAuditRecord[] = this.state.audit
  readonly ledger: EffectLedgerEntry[] = this.state.ledger
  get actionDiagnostics(): SchedulingDiagnostic[] { return this.scheduler.actionDiagnostics }
  private readonly validator: SkillValidator
  private readonly scheduler: EffectScheduler
  private readonly executor: EffectExecutor

  constructor(students: Map<number, Student>, formation: Formation, env: BattleEnv) {
    this.executor = new EffectExecutor(this.state, students, formation)
    this.scheduler = new EffectScheduler(this.state, students, formation, this.executor)
    this.state.onBeforeApply = pending => this.scheduler.beforeApply(pending)
    this.validator = new SkillValidator(students, formation, env, () => ({
      active: this.state.active,
      summons: this.state.summons,
      castCounts: this.state.castCounts,
    }))
  }

  observeActions(onApplied: (audit: EffectAuditRecord) => void, onControlChanged: (frame: number) => void): void {
    this.state.onApplied = onApplied
    this.state.onControlChanged = onControlChanged
  }

  interruptAction(actionId: string, frame: number): void {
    this.scheduler.interruptAction(actionId, frame)
  }

  markAutomaticAction(actionId: string): void { this.scheduler.markAutomaticAction(actionId) }

  schedule(intent: Intent, skill: ResolvedSkill, frame: number, runtimes: Map<number, StudentRuntimeState>, actionId?: string): void {
    this.scheduler.schedule(intent, skill, frame, runtimes, actionId)
  }

  advance(frame: number, runtimes: Map<number, StudentRuntimeState>): void {
    this.executor.advance(frame, runtimes)
  }

  validate(intent: Intent, skill: ResolvedSkill, runtimes: Map<number, StudentRuntimeState>, allowExtraEx = false, isCopied = false): string | null {
    return this.validator.validate(intent, skill, runtimes, allowExtraEx, isCopied)
  }

  snapshotSummons(): SummonInstance[] {
    return this.executor.snapshotSummons()
  }

  getEffectiveCost(studentId: number, baseCost: number): number {
    return this.executor.getEffectiveCost(studentId, baseCost)
  }

  getCostBorrowLimit(studentId: number): number {
    return this.executor.getCostBorrowLimit(studentId)
  }

  recordCostDebt(studentId: number, skillRef: SkillRef, frame: number, balance: number): void {
    this.executor.recordCostDebt(studentId, skillRef, frame, balance)
  }

  recordCostDebtRepaid(studentId: number, skillRef: SkillRef, frame: number): void {
    this.executor.recordCostDebtRepaid(studentId, skillRef, frame)
  }

  consumeCostModifiers(studentId: number, frame: number): void {
    this.executor.consumeCostModifiers(studentId, frame)
  }

  getRegenDelta(baseRegen: number): number {
    return this.executor.getRegenDelta(baseRegen)
  }
}
