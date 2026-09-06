/**
 * 旧普攻近似：仅供待用户确认的 NS 建议，不是执行记录。
 *
 * 把单条轨道的普攻循环（准备/射击/换弹）与 EX 打断投影为可渲染的
 * AttackSegment[]。不得用于 AttackTrack 或作为引擎攻击完成证据。
 *
 * 语义：
 *   - 每弹匣：prepare(enterDur) → attack × ammo（发间间隔 delay，不画段）→ reload(reloadDur)。
 *   - EX 打断后需 enterDur 帧重新 prepare。
 *   - 换弹第 0 帧弹匣即已补满，打断换弹不影响弹药补充。
 *   - EX 在射击中途时假设「本次射击已完成」；该假设未经认证。
 *
 * 纯 TS，零 React / Zustand 依赖。
 */

import type { StudentLane } from '../../types/timeline'
import type { Student } from '../../types/student'

/** 可渲染的普攻/技能片段类型（与 AttackTrack 渲染分支一致）。 */
export type AttackSegmentType = 'prepare' | 'attack' | 'reload' | 'ex'

export interface AttackSegment {
  startFrame: number
  endFrame: number
  type: AttackSegmentType
  /** 弹匣内射击序号（attack 片段用于显示「射击 #N」）。 */
  index: number
}

export interface AttackSimulationOptions {
  /** 模拟总帧数，默认 5400。 */
  totalFrames?: number
}

interface AttackParams {
  enterDur: number
  oneShot: number
  delay: number
  reloadDur: number
  ammo: number
}

function getAttackParams(s: Student): AttackParams {
  const N = s.Skills.N
  return {
    enterDur: N.Frames.AttackEnterDuration,
    oneShot: N.Frames.AttackStartDuration + N.Frames.AttackIngDuration + N.Frames.AttackEndDuration,
    delay: N.Frames.AttackBurstRoundOverDelay,
    reloadDur: N.Frames.AttackReloadDuration,
    ammo: s.Ammo || 5,
  }
}

export function simulateAttackSegments(
  lane: StudentLane,
  options?: AttackSimulationOptions,
): AttackSegment[] {
  if (!lane.student) return []
  const student = lane.student
  const totalFrames = options?.totalFrames ?? 5400
  const ap = getAttackParams(student)

  // EX 队列（仅 type === 'ex'），按起始帧升序。
  const exQueue = lane.skills
    .filter((skill) => skill.type === 'ex')
    .map((skill) => ({
      start: skill.startFrame,
      duration: skill.skillDuration ?? (student.Skills.E.Duration || 60),
    }))
    .sort((a, b) => a.start - b.start)

  const segs: AttackSegment[] = []
  const add = (type: AttackSegmentType, start: number, end: number, idx: number) => {
    const clippedEnd = Math.min(end, totalFrames)
    if (clippedEnd > start) segs.push({ startFrame: start, endFrame: clippedEnd, type, index: idx })
  }

  let cursor = 0
  let shotIdx = 0 // 弹匣内 0-based 射击序号
  let exIdx = 0
  const peekEx = (): number => (exIdx < exQueue.length ? exQueue[exIdx].start : Infinity)

  /** 消耗下一个 EX：画 ex 段，重新 prepare，并把 cursor 推进到 EX 结束后的 prepare 末尾。 */
  const castExAndReprepare = () => {
    const { start, duration } = exQueue[exIdx]
    exIdx++
    add('ex', start, start + duration, 0)
    const resume = Math.max(cursor, start + duration)
    add('prepare', resume, resume + ap.enterDur, shotIdx)
    cursor = resume + ap.enterDur
  }

  // 首轮准备
  add('prepare', 0, ap.enterDur, shotIdx)
  cursor = ap.enterDur

  while (cursor < totalFrames) {
    const shotEnd = cursor + ap.oneShot
    const exStart = peekEx()

    // EX 在射击起始帧（或更早，被上一次施放跳过）：整发未打出，子弹不消耗
    if (exStart <= cursor) {
      castExAndReprepare()
      continue
    }

    // 旧建议近似：中途射击算一次。不得据此自动推进引擎计数。
    if (exStart < shotEnd) {
      add('attack', cursor, exStart, shotIdx)
      shotIdx++
      castExAndReprepare()
      continue
    }

    // 正常完成本次射击，子弹消耗
    add('attack', cursor, shotEnd, shotIdx)
    shotIdx++
    cursor = shotEnd

    if (shotIdx >= ap.ammo) {
      // 弹匣打空 → 换弹（换弹第 0 帧弹匣已补满）
      const reloadEnd = cursor + ap.reloadDur
      const exAfter = peekEx()
      if (exAfter < reloadEnd) {
        add('reload', cursor, exAfter, shotIdx)
        shotIdx = 0
        castExAndReprepare()
        continue
      }
      add('reload', cursor, reloadEnd, shotIdx)
      cursor = reloadEnd
      shotIdx = 0
      add('prepare', cursor, cursor + ap.enterDur, shotIdx)
      cursor += ap.enterDur
      continue
    }

    // 点射间隔
    const intervalEnd = cursor + ap.delay
    const exAfter = peekEx()
    if (exAfter < intervalEnd) {
      castExAndReprepare()
      continue
    }
    cursor = intervalEnd
  }

  return segs
}
