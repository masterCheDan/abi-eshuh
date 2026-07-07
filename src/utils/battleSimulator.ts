/**
 * 战斗状态机模拟器
 *
 * 以帧驱动每位学生的状态转换，处理 EX 打断、普攻循环、
 * AttackCount 计数与 NS/SS 触发判定。
 *
 * 输出：事件流 + 可视化片段，供 AttackTrack 渲染。
 */

import {
  StudentState,
  SimEventType,
} from '../types/studentStateMachine'
import type {
  SimEvent,
  StudentRuntimeState,
  BattleSegment,
} from '../types/studentStateMachine'
import type { StudentLane } from '../types/timeline'
import type { Student } from '../types/student'
import { checkNsTrigger, getNsSkill, getNsDuration } from './nsTrigger'

// ── 战斗参数 ──
const TOTAL_FRAMES = 5400

// ── 辅助：从 Student 提取普攻参数 ──
interface AttackParams {
  enterDur: number
  startDur: number
  ingDur: number
  endDur: number
  delay: number
  reloadDur: number
  ammo: number
  nsDur: number
}

function getAttackParams(s: Student): AttackParams {
  const N = s.Skills.N
  const ns = getNsSkill(s)
  return {
    enterDur: N.Frames.AttackEnterDuration,
    startDur: N.Frames.AttackStartDuration,
    ingDur: N.Frames.AttackIngDuration,
    endDur: N.Frames.AttackEndDuration,
    delay: N.Frames.AttackBurstRoundOverDelay,
    reloadDur: N.Frames.AttackReloadDuration,
    ammo: s.Ammo || 5,
    nsDur: ns ? getNsDuration(ns) : 60,
  }
}

// ── 初始化运行时状态 ──
function initRuntime(slotIndex: number, studentId: number): StudentRuntimeState {
  return {
    slotIndex,
    studentId,
    currentState: StudentState.MOVING,
    previousState: StudentState.MOVING,
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

// ── 可视化片段追加 ──
function addSeg(
  segs: BattleSegment[],
  type: BattleSegment['type'],
  start: number,
  end: number,
  idx: number,
) {
  if (end > start) segs.push({ startFrame: start, endFrame: end, type, index: idx })
}

// ── 模拟结果 ──
export interface BattleResult {
  events: SimEvent[]
  /** slotIndex → 可视化片段 */
  segments: Map<number, BattleSegment[]>
  /** slotIndex → 最终运行时状态 */
  runtimes: Map<number, StudentRuntimeState>
}

// ═══════════════════════════════════════════════════
// 核心模拟器
// ═══════════════════════════════════════════════════

export interface BattleOptions {
  /** Boss 阶段转换发生的帧（按时间排序，每个转换持续 castDur 帧） */
  phaseTransitionFrames?: number[]
  /** 阶段转换动画时长（帧），默认 120 */
  phaseTransitionDur?: number
}

export function simulateBattle(lanes: StudentLane[], options?: BattleOptions): BattleResult {
  const events: SimEvent[] = []
  const segments = new Map<number, BattleSegment[]>()
  const runtimes = new Map<number, StudentRuntimeState>()

  const phaseTransitions = options?.phaseTransitionFrames ?? []
  const phaseDur = options?.phaseTransitionDur ?? 120
  let nextPhaseIdx = 0
  const nextPhaseFrame = (from: number): number => {
    while (nextPhaseIdx < phaseTransitions.length && phaseTransitions[nextPhaseIdx] < from) nextPhaseIdx++
    return nextPhaseIdx < phaseTransitions.length ? phaseTransitions[nextPhaseIdx] : Infinity
  }

  for (const lane of lanes) {
    if (!lane.student) continue

    const rt = initRuntime(lane.slotIndex, lane.student.Id)
    const ap = getAttackParams(lane.student)
    const segs: BattleSegment[] = []

    // 预加载 EX 队列（携带真实时长）
    for (const skill of lane.skills) {
      if (skill.type === 'ex') {
        const dur = skill.skillDuration ?? lane.student!.Skills.E.Duration
        rt.queuedEx.push({ startFrame: skill.startFrame, duration: dur })
      }
    }
    rt.queuedEx.sort((a, b) => a.startFrame - b.startFrame)

    // 初始动作：进入普攻准备
    enterPrepareState(rt, ap, 0, segs)

    // ── 帧主循环 ──
    let frame = 0
    while (frame < TOTAL_FRAMES) {
      // ═══ 0. 最高优先级：阶段转换结束恢复 ═══
      if (rt.currentState === StudentState.PHASE_TRANSITION && frame >= rt.phaseTransitionUntil) {
        addSeg(segs, 'phase_transition', rt.currentActionStartFrame, rt.phaseTransitionUntil, 0)
        events.push({
          frame: rt.phaseTransitionUntil,
          type: SimEventType.PHASE_TRANSITION_END,
          slotIndex: rt.slotIndex,
          studentId: rt.studentId,
        })
        rt.phaseTransitionUntil = 0
        // 阶段转换后重置动作 → 进入普攻准备
        enterPrepareState(rt, ap, frame, segs)
        continue
      }

      // ═══ 1. 最高优先级：阶段转换 ═══
      const nextPhase = nextPhaseFrame(frame)
      if (nextPhase === frame) {
        // 阶段转换打断一切（包括 EX 和 CONTROLLED）
        addSeg(segs, 'phase_transition', frame, frame + phaseDur, 0)
        rt.previousState = rt.currentState
        rt.currentState = StudentState.PHASE_TRANSITION
        rt.currentActionStartFrame = frame
        rt.currentActionEndFrame = frame + phaseDur
        rt.phaseTransitionUntil = frame + phaseDur
        rt.ammoRemaining = 0 // 阶段转换后需重新准备
        events.push({
          frame,
          type: SimEventType.PHASE_TRANSITION_START,
          slotIndex: rt.slotIndex,
          studentId: rt.studentId,
        })
        nextPhaseIdx++
        frame = frame + phaseDur
        continue
      }

      // ═══ 2. 阶段转换进行中 → 跳过 ═══
      if (rt.currentState === StudentState.PHASE_TRANSITION) {
        frame = rt.phaseTransitionUntil
        continue
      }

      // ═══ 3. 检查阶段转换在动作中途 ═══
      if (nextPhase < rt.currentActionEndFrame) {
        addSeg(segs, 'phase_transition', frame, nextPhase, 0)
        frame = nextPhase
        continue
      }

      // ═══ 4. 检查控制效果结束 ═══
      if (rt.currentState === StudentState.CONTROLLED && frame >= rt.controlledUntil) {
        restoreFromControl(rt, ap, frame, segs)
      }

      // ═══ 5. 检查是否有排队的 EX ═══
      const nextEx = rt.queuedEx.length > 0 ? rt.queuedEx[0].startFrame : Infinity

      if (nextEx === frame) {
        // EX 在该帧触发
        handleExInterrupt(rt, ap, frame, segs, events)
        const entry5 = rt.queuedEx.shift()!
        enterExState(rt, ap, frame, entry5.duration, segs, events)
        frame = rt.currentActionEndFrame
        continue
      }

      // ═══ 6. 当前动作完成 → 选择下一个动作 ═══
      if (frame >= rt.currentActionEndFrame) {
        selectNextAction(rt, ap, frame, segs, events)
        if (rt.currentActionEndFrame <= frame) {
          break
        }
        continue
      }

      // ═══ 7. 跳到下一个关键帧（动作结束 / EX 帧 / 阶段转换帧） ═══
      const jumpFrame = Math.min(rt.currentActionEndFrame, nextEx, nextPhase)
      if (jumpFrame <= frame) {
        frame++
        continue
      }

      // ═══ 8. 检查当前动作期间的 EX ═══
      if (nextEx < rt.currentActionEndFrame) {
        switch (rt.currentState) {
          case StudentState.NORMAL_ATTACK: {
            const shotStart = rt.currentActionStartFrame + ap.enterDur
            const shotEnd = rt.currentActionStartFrame + ap.enterDur + ap.startDur + ap.ingDur + ap.endDur

            if (nextEx >= shotStart && nextEx < shotEnd) {
              // EX 在射击过程中 → 本次射击视为完成
              addSeg(segs, 'attack', frame, nextEx, rt.currentShotIndex)
              rt.attackCount++
              rt.ammoRemaining--
              rt.currentShotIndex++
              // 检查 NS 触发（射击已完成）
              if (!rt.nsTriggered && lane.student) {
                const nr = checkNsTrigger({ student: lane.student, frame, attackCount: rt.attackCount, shotIndex: rt.currentShotIndex })
                if (nr.shouldTrigger) { rt.nsTriggered = true; events.push({ frame, type: SimEventType.NS_TRIGGER, slotIndex: rt.slotIndex, studentId: rt.studentId }) }
              }
            } else if (nextEx >= frame && nextEx < shotStart) {
              // EX 在准备阶段 → 射击未开始，子弹不消耗
              addSeg(segs, 'prepare', frame, nextEx, rt.currentShotIndex)
            } else {
              // EX 在射击间隔
              addSeg(segs, 'attack', frame, nextEx, rt.currentShotIndex)
            }

            addSeg(segs, 'interrupted', nextEx, nextEx, rt.currentShotIndex)
            frame = nextEx
            handleExInterrupt(rt, ap, frame, segs, events)
            const entry8a = rt.queuedEx.shift()!
            enterExState(rt, ap, frame, entry8a.duration, segs, events)
            frame = rt.currentActionEndFrame
            continue
          }

          default: {
            // 其他状态被 EX 打断
            frame = nextEx
            handleExInterrupt(rt, ap, frame, segs, events)
            const entry8b = rt.queuedEx.shift()!
            enterExState(rt, ap, frame, entry8b.duration, segs, events)
            frame = rt.currentActionEndFrame
            continue
          }
        }
      }

      // 无 EX 打断 → 正常完成当前动作
      switch (rt.currentState) {
        case StudentState.NORMAL_ATTACK:
          frame = processNormalAttack(rt, ap, lane.student, frame, segs, events)
          break
        default:
          frame = rt.currentActionEndFrame
      }
    }

    segments.set(lane.slotIndex, segs)
    runtimes.set(lane.slotIndex, rt)
  }

  return { events, segments, runtimes }
}

// ── 进入普攻准备 ──
function enterPrepareState(
  rt: StudentRuntimeState,
  ap: AttackParams,
  frame: number,
  segs: BattleSegment[],
) {
  rt.currentState = StudentState.NORMAL_ATTACK
  rt.currentActionStartFrame = frame
  rt.currentActionEndFrame = frame + ap.enterDur

  if (rt.ammoRemaining <= 0) {
    rt.ammoRemaining = ap.ammo
    rt.currentShotIndex = 0
  }

  addSeg(segs, 'prepare', frame, rt.currentActionEndFrame, rt.currentShotIndex)
}

// ── 处理单次普攻（准备完成后 → 射击） ──
function processNormalAttack(
  rt: StudentRuntimeState,
  ap: AttackParams,
  student: Student | null,
  frame: number,
  segs: BattleSegment[],
  events: SimEvent[],
): number {
  const shotStart = rt.currentActionStartFrame + ap.enterDur
  const shotEnd = shotStart + ap.startDur + ap.ingDur + ap.endDur

  if (frame >= shotStart && frame < shotEnd) {
    // 正在射击中
    addSeg(segs, 'attack', frame, shotEnd, rt.currentShotIndex)
    frame = shotEnd
    rt.attackCount++
    rt.ammoRemaining--
    rt.currentShotIndex++

    events.push({
      frame: shotStart + ap.startDur,
      type: SimEventType.NORMAL_ATTACK_HIT,
      slotIndex: rt.slotIndex,
      studentId: rt.studentId,
    })

    // ── NS 触发判定（仅在非 EX 打断的常规命中时检查） ──
    if (!rt.nsTriggered && student) {
      const nsResult = checkNsTrigger({
        student,
        frame,
        attackCount: rt.attackCount,
        shotIndex: rt.currentShotIndex,
      })
      if (nsResult.shouldTrigger) {
        rt.nsTriggered = true
        events.push({
          frame,
          type: SimEventType.NS_TRIGGER,
          slotIndex: rt.slotIndex,
          studentId: rt.studentId,
        })
      }
    }
  }

  // 射击后处理
  if (rt.ammoRemaining <= 0) {
    // 弹匣空 → 换弹
    const reloadEnd = shotEnd + ap.reloadDur
    // 注意：EX 帧已在上层检查过，这里直接完成换弹
    addSeg(segs, 'reload', shotEnd, reloadEnd, rt.currentShotIndex)
    rt.ammoRemaining = ap.ammo
    rt.currentShotIndex = 0
    events.push({
      frame: shotEnd,
      type: SimEventType.RELOAD_START,
      slotIndex: rt.slotIndex,
      studentId: rt.studentId,
    })
    events.push({
      frame: reloadEnd,
      type: SimEventType.RELOAD_END,
      slotIndex: rt.slotIndex,
      studentId: rt.studentId,
    })

    // 换弹后进入准备
    enterPrepareState(rt, ap, reloadEnd, segs)
    return reloadEnd
  } else {
    // 还有弹药 → 射击间隔
    const intervalEnd = shotEnd + ap.delay
    // 间隔结束后下一次射击
    rt.currentActionStartFrame = intervalEnd
    rt.currentActionEndFrame = intervalEnd // 无准备，直接射击
    return shotEnd
  }
}

// ── 进入 EX 状态 ──
function enterExState(
  rt: StudentRuntimeState,
  _ap: AttackParams,
  frame: number,
  exDuration: number,
  segs: BattleSegment[],
  events: SimEvent[],
) {
  rt.previousState = rt.currentState
  rt.currentState = StudentState.CAST_EX
  rt.currentActionStartFrame = frame
  rt.currentActionEndFrame = frame + exDuration

  addSeg(segs, 'ex', frame, rt.currentActionEndFrame, 0)

  events.push({
    frame,
    type: SimEventType.EX_START,
    slotIndex: rt.slotIndex,
    studentId: rt.studentId,
  })
  events.push({
    frame: rt.currentActionEndFrame,
    type: SimEventType.EX_END,
    slotIndex: rt.slotIndex,
    studentId: rt.studentId,
  })
}

// ── EX 打断处理 ──
function handleExInterrupt(
  rt: StudentRuntimeState,
  _ap: AttackParams,
  frame: number,
  _segs: BattleSegment[],
  events: SimEvent[],
) {
  const state = rt.currentState

  switch (state) {
    case StudentState.NORMAL_ATTACK:
      events.push({
        frame,
        type: SimEventType.NORMAL_ATTACK_END,
        slotIndex: rt.slotIndex,
        studentId: rt.studentId,
        data: { interrupted: true },
      })
      break
    case StudentState.CAST_NS_SS:
      events.push({
        frame,
        type: SimEventType.NS_END,
        slotIndex: rt.slotIndex,
        studentId: rt.studentId,
        data: { interrupted: true },
      })
      break
    default:
      break
  }
}

// ── 从控制恢复 ──
function restoreFromControl(
  rt: StudentRuntimeState,
  ap: AttackParams,
  frame: number,
  segs: BattleSegment[],
) {
  const prev = rt.previousState
  rt.currentState = prev
  rt.controlledUntil = 0

  // 恢复后进入准备状态
  enterPrepareState(rt, ap, frame, segs)
}

// ── SelectNextAction ──
// 优先级: 阶段转换(主循环处理) > 控制 > EX > NS/SS > 普攻 > 移动
function selectNextAction(
  rt: StudentRuntimeState,
  ap: AttackParams,
  frame: number,
  segs: BattleSegment[],
  events: SimEvent[],
) {
  // 1. 是否被控制
  if (rt.controlledUntil > frame) {
    rt.currentState = StudentState.CONTROLLED
    return
  }

  // 2. 是否有排队 EX（已在主循环处理，这里做保险）
  if (rt.queuedEx.length > 0 && rt.queuedEx[0].startFrame <= frame) {
    const entrySel = rt.queuedEx.shift()!
    enterExState(rt, ap, frame, entrySel.duration, segs, events)
    return
  }

  // 3. NS 已触发 → 施放 NS
  if (rt.nsTriggered) {
    rt.nsTriggered = false
    enterNsState(rt, ap, frame, segs, events)
    return
  }

  // 4. 默认 → 普攻
  enterPrepareState(rt, ap, frame, segs)
}

// ── 进入 NS 施放状态 ──
function enterNsState(
  rt: StudentRuntimeState,
  ap: AttackParams,
  frame: number,
  segs: BattleSegment[],
  events: SimEvent[],
) {
  rt.previousState = rt.currentState
  rt.currentState = StudentState.CAST_NS_SS
  rt.currentActionStartFrame = frame
  rt.currentActionEndFrame = frame + ap.nsDur

  addSeg(segs, 'ns', frame, rt.currentActionEndFrame, rt.attackCount)

  events.push({
    frame,
    type: SimEventType.NS_START,
    slotIndex: rt.slotIndex,
    studentId: rt.studentId,
  })
  events.push({
    frame: rt.currentActionEndFrame,
    type: SimEventType.NS_END,
    slotIndex: rt.slotIndex,
    studentId: rt.studentId,
  })
}
