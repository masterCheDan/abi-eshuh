/**
 * 普攻循环模拟 (含 EX 打断)
 *
 * 每轮弹匣 = [Start+Ing+End+OverDelay] × Ammo → 换弹
 * EX 技能在任意帧开始时会打断当前动作。
 * 打断后需要 AttackEnterDuration 帧恢复前摇。
 */

import type { Student } from '../types/student'
import type { SkillBlock } from '../types/timeline'

export interface AttackSegment {
  startFrame: number
  endFrame: number
  type: 'prepare' | 'attack' | 'reload' | 'interrupted'
  index: number
}

export function computeAttackTimeline(
  student: Student,
  exSkills: SkillBlock[],
  totalFrames: number,
): AttackSegment[] {
  const N = student.Skills.N
  const enterDur  = N.Frames.AttackEnterDuration
  const startDur  = N.Frames.AttackStartDuration
  const ingDur    = N.Frames.AttackIngDuration
  const endDur    = N.Frames.AttackEndDuration
  const delay     = N.Frames.AttackBurstRoundOverDelay
  const reloadDur = N.Frames.AttackReloadDuration

  const oneShot = startDur + ingDur + endDur
  const ammo = student.Ammo || 5
  const resumePrep = enterDur // 被打断后重新准备需要的帧数

  const segs: AttackSegment[] = []
  const add = (type: AttackSegment['type'], start: number, end: number, idx: number) => {
    if (end > start) segs.push({ startFrame: start, endFrame: end, type, index: idx })
  }

  // 首轮准备
  let cursor = 0
  let shotIdx = 0
  add('prepare', 0, cursor + enterDur, shotIdx)
  cursor += enterDur

  // 找到下一个 EX 帧
  let exIdx = 0
  const nextExFrame = (from: number) => {
    while (exIdx < exSkills.length && exSkills[exIdx].startFrame < from) exIdx++
    return exIdx < exSkills.length ? exSkills[exIdx].startFrame : Infinity
  }

  const handleExAtFrame = (f: number) => {
    add('interrupted', cursor, f, shotIdx)
    exIdx++ // 消耗该 EX
    return f + (student.Skills.E.Duration || 60)
  }

  while (cursor < totalFrames) {
    // ── 一个弹匣 ──
    for (let a = 0; a < ammo && cursor < totalFrames; a++) {
      const shotEnd = cursor + oneShot
      const nextEx = nextExFrame(cursor)

      if (nextEx === cursor) {
        // EX 在射击起始帧 → 整发射击被打断，子弹未消耗
        cursor = handleExAtFrame(cursor)
        add('prepare', cursor, cursor + resumePrep, shotIdx)
        cursor += resumePrep
        a-- // 重试本发射击，弹匣不补充
        continue
      }

      if (nextEx < shotEnd) {
        // EX 在射击中途 → 游戏视为本次普攻已完成，子弹消耗
        add('attack', cursor, nextEx, shotIdx++)
        cursor = handleExAtFrame(nextEx)
        add('prepare', cursor, cursor + resumePrep, shotIdx)
        cursor += resumePrep
        continue
      }

      // 正常射击完成，子弹消耗
      add('attack', cursor, shotEnd, shotIdx++)
      cursor = shotEnd

      if (a < ammo - 1) {
        const intervalEnd = cursor + delay
        const nextExAfter = nextExFrame(cursor + 1)
        if (nextExAfter < intervalEnd) {
          // 射击完成但间隔被 EX 打断，子弹已消耗
          add('interrupted', cursor, nextExAfter, shotIdx)
          cursor = handleExAtFrame(nextExAfter)
          add('prepare', cursor, cursor + resumePrep, shotIdx)
          cursor += resumePrep
          // 弹匣不补充，继续下一发
          continue
        }
        cursor = intervalEnd
      }
    }

    if (cursor >= totalFrames) break

    // 换弹（仅在弹匣打空时到达）
    // 游戏机制：换弹动画第0帧弹匣已补满，打断换弹不影响弹药补充
    const reloadEnd = cursor + reloadDur
    const nextEx = nextExFrame(cursor)
    if (nextEx < reloadEnd) {
      // 换弹动画被 EX 截断，但弹匣已满，直接进入射击
      add('reload', cursor, nextEx, shotIdx)
      cursor = handleExAtFrame(nextEx)
      add('prepare', cursor, cursor + resumePrep, shotIdx)
      cursor += resumePrep
      continue
    }
    add('reload', cursor, reloadEnd, shotIdx)
    cursor = reloadEnd
  }

  return segs
}
