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
import type { StudentLane } from '../../types/timeline'
import type {
  Intent,
  BattleEnv,
  Formation,
  ActionRecord,
  SimulationResult,
  SimulationError,
  StudentRuntimeState,
} from '../model/types'
import { StudentState } from '../model/types'
import { isInterruptible } from '../model/fsm'
import { TriggerScheduler, getNsSkill, getNsDuration } from '../system/triggerScheduler'
import { computeCostTimeline, costAtFrame, COST_SCALE } from '../system/costSystem'

// ═══════════════════════════════════════════════════
// Engine 门面
// ═══════════════════════════════════════════════════

export class SimulationEngine {
  private env!: BattleEnv
  private formation!: Formation
  private students: Map<number, Student> = new Map()
  private lanes: StudentLane[] = []
  private scheduler: TriggerScheduler = new TriggerScheduler()
  private logIdCounter = 0
  /** 滑动窗口左边界（已消费的牌数） */
  private windowLeft = 0

  /** 加载战斗环境 */
  loadBattle(env: BattleEnv, formation: Formation, students: Map<number, Student>): void {
    this.env = env
    this.formation = formation
    this.students = students

    // 用 formation 构建 StudentLane 供 costSystem 使用
    this.lanes = formation.slots.map((sid, i) => {
      const student = sid != null ? students.get(sid) ?? null : null
      const label =
        i < (formation.mode === 'normal' ? 4 : 6)
          ? `STRIKER ${i + 1}`
          : `SPECIAL ${i - (formation.mode === 'normal' ? 4 : 6) + 1}`
      return {
        slotIndex: i,
        label,
        student,
        studentId: sid,
        skills: [], // 由 simulate() 填充
      }
    })
  }

  /**
   * 执行全量推演
   *
   * @param intents 用户指令列表 (EX_CAST)
   */
  simulate(intents: Intent[]): SimulationResult {
    this.scheduler.reset()
    this.logIdCounter = 0
    this.windowLeft = 0

    const maxFrame = this.env.maxFrame
    const actionLogs: ActionRecord[] = []
    const errors: SimulationError[] = []

    // ── 初始化运行时 ──
    const runtimes = new Map<number, StudentRuntimeState>()
    for (let i = 0; i < this.formation.slots.length; i++) {
      const sid = this.formation.slots[i]
      if (sid == null) continue
      runtimes.set(i, this.initRuntime(i, sid))
    }

    // ── Cost 时间线 ──
    // 先将 Intent 注入到 lanes 中以便 costSystem 计算
    this.injectIntentsToLanes(intents)
    const costTimeline = computeCostTimeline(this.lanes, this.formation.mode, maxFrame)
    const costHistory: number[] = []

    // ── Tick Pipeline ──
    for (let frame = 0; frame <= maxFrame; frame++) {
      // Step 1: Clock Update (already done by loop)
      // Step 2: Buff/CC Update
      this.updateCC(runtimes, frame)
      costHistory.push(costAtFrame(costTimeline, frame))

      // Step 3: FSM Tick — 步进所有角色
      this.tickAllFSM(runtimes, frame)

      // Step 4: Trigger Scheduler — 检查触发条件
      this.tickScheduler(runtimes, frame)

      // Step 5: Intent Resolve — 收集本帧 Intent
      const frameIntents = this.resolveIntents(intents, frame)

      // 从 scheduler 拉取系统 Intent
      const systemIntents = this.scheduler.pollIntents(frame)
      const allIntents = [...frameIntents, ...systemIntents]

      if (allIntents.length === 0) continue

      // Step 6: Priority Sort (稳定排序)
      allIntents.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return 0 // 稳定：按原始顺序 (ES spec 保证)
      })

      // Step 7: FSM Apply — 注入 Intent
      for (const intent of allIntents) {
        const slot = this.resolveSlot(intent.issuerId)
        if (slot < 0) continue

        const runtime = runtimes.get(slot)
        const student = this.students.get(intent.issuerId)
        if (!runtime || !student) continue

        // 滑动窗口验证
        if (intent.type === 'EX_CAST') {
          if (!this.isInWindow(slot)) {
            errors.push({
              frame,
              issuerId: intent.issuerId,
              message: `card_order_violation`,
              type: 'OUT_OF_WINDOW',
            })
            // 不阻断推演，仅记录
          }
          if (costAtFrame(costTimeline, Math.max(0, frame - 1)) < (student.Skills.E.Cost[(this.formation.skillLevels?.[slot] ?? 5) - 1]) * COST_SCALE) {
            errors.push({
              frame,
              issuerId: intent.issuerId,
              message: `Cost exceeded at frame ${frame}`,
              type: 'COST_EXCEEDED',
            })
          }
        }

        this.applyIntent(intent, runtime, student, frame, actionLogs)

        // EX_CAST 成功后推进滑动窗口
        if (intent.type === 'EX_CAST') {
          this.advanceWindow(slot)
        }
      }
    }

    // Step 8: Logging (already captured in actionLogs)

    // 仅在用户显式设置了 deckOrder 时暴露窗口信息
    let windowInfo:
      | { left: number; size: number; deck: number[] }
      | undefined
    if (this.formation.deckOrder) {
      windowInfo = {
        left: this.windowLeft,
        size: this.formation.mode === 'normal' ? 3 : 5,
        deck: this.formation.deckOrder,
      }
    }

    return {
      maxFrame,
      costHistory,
      actionLogs,
      errors,
      window: windowInfo,
      finalRuntimes: runtimes,
    }
  }

  // ═══════════════════════════════════════════════
  // Tick Pipeline — 各步骤
  // ═══════════════════════════════════════════════

  /** Step 2: 更新 CC 控制状态 */
  private updateCC(runtimes: Map<number, StudentRuntimeState>, frame: number): void {
    for (const rt of runtimes.values()) {
      if (rt.controlledUntil > 0 && rt.controlledUntil <= frame) {
        rt.controlledUntil = 0
        rt.currentState = StudentState.IDLE
      }
    }
  }

  /** Step 3: 步进所有角色的动作帧 */
  private tickAllFSM(
    runtimes: Map<number, StudentRuntimeState>,
    frame: number,
  ): void {
    for (const [, rt] of runtimes) {
      const student = this.students.get(rt.studentId)
      if (!student) continue

      // 如果动作结束，回 IDLE
      if (rt.currentActionEndFrame > 0 && frame >= rt.currentActionEndFrame) {
        rt.previousState = rt.currentState
        rt.currentState = StudentState.IDLE
      }
    }
  }

  /** Step 4: 触发器调度 */
  private tickScheduler(
    runtimes: Map<number, StudentRuntimeState>,
    frame: number,
  ): void {
    for (const [slot, rt] of runtimes) {
      const student = this.students.get(rt.studentId)
      if (!student) continue

      // NS 触发判定
      if (rt.currentActionEndFrame > 0 && frame >= rt.currentActionEndFrame) {
        const ns = getNsSkill(student)
        if (ns) {
          this.scheduler.scheduleNs(
            {
              student,
              frame,
              attackCount: rt.attackCount,
              shotIndex: rt.currentShotIndex,
              runtime: rt,
            },
            slot,
            rt.studentId,
          )
        }
      }
    }
  }

  /** Step 5: 收集本帧用户 Intent */
  private resolveIntents(intents: Intent[], frame: number): Intent[] {
    return intents.filter(i => i.frame === frame)
  }

  /** Step 7: 注入 Intent → FSM 跳转 */
  private applyIntent(
    intent: Intent,
    runtime: StudentRuntimeState,
    student: Student,
    frame: number,
    logs: ActionRecord[],
  ): void {
    if (!isInterruptible(runtime.currentState)) return

    let targetState: StudentState
    let duration: number
    let actionType: ActionRecord['actionType']

    switch (intent.type) {
      case 'EX_CAST':
        targetState = StudentState.EX
        duration = student.Skills.E.Duration
        actionType = 'EX'
        break
      case 'NS_TRIGGER': {
        const ns = getNsSkill(student)
        targetState = StudentState.NS
        duration = ns ? getNsDuration(ns) : 60
        actionType = 'NS'
        break
      }
      case 'SS_TRIGGER':
        targetState = StudentState.SS_CAST
        duration = 60
        actionType = 'SS'
        break
      case 'CC_APPLY':
        targetState = StudentState.CC
        duration = 120
        actionType = 'CC'
        break
      default:
        return
    }

    const prevEndFrame = runtime.currentActionEndFrame

    runtime.previousState = runtime.currentState
    runtime.currentState = targetState
    runtime.currentActionStartFrame = frame
    runtime.currentActionEndFrame = frame + duration

    logs.push({
      recordId: `${this.logIdCounter++}`,
      studentId: runtime.studentId,
      slotIndex: runtime.slotIndex,
      actionType,
      startFrame: frame,
      effectFrame: frame + getEffectFrame(student, intent.type),
      endFrame: frame + duration,
      wasInterrupted: false,
      isManualOverride: false,
      interruptedAt: prevEndFrame > frame ? frame : undefined,
    })
  }

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
    }
  }

  /** 通过 studentId 反查 slotIndex */
  private resolveSlot(studentId: number): number {
    for (let i = 0; i < this.formation.slots.length; i++) {
      if (this.formation.slots[i] === studentId) return i
    }
    return -1
  }

  /** 滑动窗口验证
   *
   * 日服"全技能顺序预设"机制:
   * - 常规 4+2: 队列长度 6, 窗口大小 3
   * - 大决战 6+4: 队列长度 10, 窗口大小 5
   *
   * 排队: 所有在场学生按 deckOrder 排列
   * 发牌: 战斗开始发 windowSize 张 → 窗口 [0, windowSize)
   * 消耗: 每次 EX_CAST 消耗窗口内该卡及左侧所有卡, 窗口右移
   *
   * @returns true = 在窗口内可释放; false = 越界（不阻断推演）
   */
  private isInWindow(slot: number): boolean {
    // 用户未设置 deckOrder → 不验证牌序
    if (!this.formation.deckOrder) return true

    const windowSize = this.formation.mode === 'normal' ? 3 : 5
    const deck = this.formation.deckOrder

    if (deck.length === 0) return true

    const slotPos = deck.indexOf(slot)
    if (slotPos < 0) return true

    const inWindow = slotPos >= this.windowLeft && slotPos < this.windowLeft + windowSize
    return inWindow
  }

  /**
   * 推进滑动窗口：消耗 slot 所在的卡牌及左侧所有卡牌
   * 应在 EX_CAST 成功应用后调用
   */
  private advanceWindow(slot: number): void {
    if (!this.formation.deckOrder) return
    const deck = this.formation.deckOrder

    const slotPos = deck.indexOf(slot)
    if (slotPos >= this.windowLeft) {
      this.windowLeft = slotPos + 1
    }
  }

  /** 将 Intent 临时注入到 lanes.skills 中供 costSystem 计算 */
  private injectIntentsToLanes(intents: Intent[]): void {
    for (const lane of this.lanes) lane.skills = []
    for (const intent of intents) {
      if (intent.type !== 'EX_CAST') continue
      const slot = this.resolveSlot(intent.issuerId)
      if (slot < 0) continue
      const student = this.students.get(intent.issuerId)
      const exLevel = this.formation.skillLevels?.[slot] ?? 5
      this.lanes[slot].skills.push({
        type: 'ex',
        name: student?.Skills.E.Name ?? '',
        startFrame: intent.frame,
        studentId: intent.issuerId,
        targetId: intent.targetIds[0],
        skillCost: student ? student.Skills.E.Cost[exLevel - 1] : 0,
        skillDuration: student?.Skills.E.Duration,
      })
    }
  }
}

/** 取技能首个效果的 ApplyFrame；无效果或无 ApplyFrame 时返回 0 */
function getEffectFrame(student: Student, intentType: Intent['type']): number {
  let effects: { ApplyFrame?: number }[] = []
  if (intentType === 'EX_CAST') {
    effects = student.Skills.E.Effects
  } else if (intentType === 'NS_TRIGGER') {
    const ns = getNsSkill(student)
    if (ns) effects = ns.Effects
  } else if (intentType === 'SS_TRIGGER') {
    effects = student.Skills.EP.Effects
  }
  for (const ef of effects) {
    if (ef.ApplyFrame != null) return ef.ApplyFrame
  }
  return 0
}
