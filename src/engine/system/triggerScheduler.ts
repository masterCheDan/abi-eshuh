/**
 * 触发器调度中心 (Trigger Scheduler)
 *
 * 负责跨实体的条件判定（时间型、自身状态型、全局事件型）
 * 与人工校准延迟 (Offset Injection)。
 *
 * 架构：
 *   - 当判定 NS 满足条件时，查询 Override Table
 *   - 若存在偏移，挂起 (Queued)，延迟后向 FSM 发送 Intent
 *   - FSM 接收指令后执行跳转
 */

import type { Intent, CalibrationEntry, StudentRuntimeState } from '../model/types'
import { StudentState } from '../model/types'
import { PRIORITY } from '../model/fsm'
import type { Student } from '../../types/student'
import type { PublicSkill } from '../../types/student'

// ═══════════════════════════════════════════════════
// NS 触发上下文
// ═══════════════════════════════════════════════════

export interface NsTriggerContext {
  student: Student
  frame: number
  attackCount: number
  shotIndex: number
  runtime: StudentRuntimeState
  buffStacks?: Record<string, number>
}

export interface NsTriggerResult {
  shouldTrigger: boolean
  reason?: string
}

// ═══════════════════════════════════════════════════
// 调度器内部状态
// ═══════════════════════════════════════════════════

interface PendingTrigger {
  intent: Intent
  /** 实际执行帧（含偏移后） */
  scheduledFrame: number
}

export class TriggerScheduler {
  /** 人工校准表 */
  private overrides: Map<number, CalibrationEntry[]> = new Map()
  /** 挂起的触发器队列 */
  private pending: PendingTrigger[] = []
  /** NS 触发次数追踪: slotIndex → count */
  private nsCount: Map<number, number> = new Map()
  /** SS 触发次数追踪: slotIndex → count */
  private ssCount: Map<number, number> = new Map()

  /** 设置人工校准表 */
  loadOverrides(entries: CalibrationEntry[]): void {
    this.overrides.clear()
    for (const e of entries) {
      const list = this.overrides.get(e.charIdx) ?? []
      list.push(e)
      this.overrides.set(e.charIdx, list)
    }
  }

  /** 获取某学生的 NS 触发次数 */
  getNsCount(slotIndex: number): number {
    return this.nsCount.get(slotIndex) ?? 0
  }

  /** 获取某学生的 SS 触发次数 */
  getSsCount(slotIndex: number): number {
    return this.ssCount.get(slotIndex) ?? 0
  }

  /** 重置所有状态 */
  reset(): void {
    this.pending = []
    this.nsCount.clear()
    this.ssCount.clear()
    this.overrides.clear()
  }

  /**
   * 判断 NS 是否应触发，并挂入调度队列
   * @returns 是否成功调度 (true = 已挂入 pending 队列)
   */
  scheduleNs(
    ctx: NsTriggerContext,
    slotIndex: number,
    studentId: number,
  ): boolean {
    const result = this.checkNsCondition(ctx)
    if (!result.shouldTrigger) return false

    // 查找 Override
    const nsIdx = (this.nsCount.get(slotIndex) ?? 0) + 1
    let offset = 0
    const overrides = this.overrides.get(slotIndex) ?? []
    const match = overrides.find(o => o.skill === 'NS' && o.occurrence === nsIdx)
    if (match) offset = match.offset

    const intent: Intent = {
      id: `ns-${slotIndex}-${nsIdx}`,
      frame: ctx.frame + offset,
      type: 'NS_TRIGGER',
      issuerId: studentId,
      targetIds: [studentId],
      priority: PRIORITY.NS_TRIGGER,
    }

    this.nsCount.set(slotIndex, nsIdx)
    this.pending.push({ intent, scheduledFrame: intent.frame })
    return true
  }

  /**
   * 判断 SS 是否应触发，并挂入调度队列
   */
  scheduleSs(
    _condition: string,
    satisfies: boolean,
    frame: number,
    slotIndex: number,
    studentId: number,
  ): boolean {
    if (!satisfies) return false

    const ssIdx = (this.ssCount.get(slotIndex) ?? 0) + 1
    let offset = 0
    const overrides = this.overrides.get(slotIndex) ?? []
    const match = overrides.find(o => o.skill === 'SS' && o.occurrence === ssIdx)
    if (match) offset = match.offset

    const intent: Intent = {
      id: `ss-${slotIndex}-${ssIdx}`,
      frame: frame + offset,
      type: 'SS_TRIGGER',
      issuerId: studentId,
      targetIds: [studentId],
      priority: PRIORITY.SS_TRIGGER,
    }

    this.ssCount.set(slotIndex, ssIdx)
    this.pending.push({ intent, scheduledFrame: intent.frame })
    return true
  }

  /**
   * 取出当前帧应执行的所有 Intent
   */
  pollIntents(frame: number): Intent[] {
    const due = this.pending.filter(p => p.scheduledFrame <= frame)
    this.pending = this.pending.filter(p => p.scheduledFrame > frame)
    return due.map(p => p.intent)
  }

  // ── 私有：NS 触发条件判定 ──

  private checkNsCondition(ctx: NsTriggerContext): NsTriggerResult {
    const { student, runtime } = ctx

    // 必须在普攻结束帧才能触发
    if (runtime.currentState !== StudentState.AA) {
      return { shouldTrigger: false, reason: 'not in AA state' }
    }

    const ns = getNsSkill(student)
    if (!ns) return { shouldTrigger: false, reason: 'no NS skill' }

    const duration = ns.Duration ?? 60

    // 检查不被 CC 控制
    if (runtime.controlledUntil > ctx.frame) {
      return { shouldTrigger: false, reason: 'controlled' }
    }

    // 检查 NS 动画不会与已排队的 EX 重叠
    if (
      runtime.queuedEx.some(
        ex => ex.startFrame >= ctx.frame && ex.startFrame < ctx.frame + duration,
      )
    ) {
      return { shouldTrigger: false, reason: 'EX would overlap NS' }
    }

    // 检查 NS 条件 (从 nsTrigger.ts 迁移)
    const ep = student.Skills.EP
    if (ep?.Effects) {
      for (const effect of ep.Effects) {
        if (!effect.Condition) continue
        // 简化：有 Condition 的 NS 需满足条件才触发
        const cond = effect.Condition as Record<string, unknown>
        if (
          cond.Type === 'BuffCount' &&
          ctx.buffStacks &&
          cond.Parameter &&
          cond.Operand &&
          cond.Value != null
        ) {
          const stack = ctx.buffStacks[cond.Parameter as string] ?? 0
          const target = cond.Value as number
          if (cond.Operand === 'GreaterEqual' && stack < target) {
            return { shouldTrigger: false, reason: 'BuffCount condition not met' }
          }
        }
      }
    }

    return { shouldTrigger: true }
  }
}

// ═══════════════════════════════════════════════════
// 辅助：获取 NS 技能
// ═══════════════════════════════════════════════════

export function getNsSkill(student: Student): PublicSkill | null {
  if (student.HasGear) {
    return student.Skills.G ?? student.Skills.P
  }
  return student.Skills.P ?? null
}

export function getNsDuration(ns: PublicSkill): number {
  return ns.Duration ?? 60
}
