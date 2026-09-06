/**
 * NS 预排：将可验证的周期事件与待用户确认的建议分开。
 *
 * 只有 automatic 进入时间轴事实；suggestions 不参与引擎模拟。
 * 触发数据来自 domain/rules/nsTriggerRules 的显式清单，不解析 Desc。
 */

import type { StudentLane, SkillBlock, NsSuggestion } from '../types/timeline'
import { automaticNsError, requiredTriggerReasons } from '../domain/triggerEvidence'
import type { Student } from '../types/student'
import { rules } from '../domain/rules/GameRules'
import type { NsTriggerRule } from '../domain/rules/GameRules'
import { nsSkillFor } from '../domain/student'
import { simulateAttackSegments } from '../engine/system/attackSimulation'

export interface ScheduleNsInput {
  lane: StudentLane
  student: Student
  rule: NsTriggerRule
  /** 时间轴总帧数（Boss 时长 × 30）。 */
  totalFrames: number
  /** 爱用品状态（0/1/2）。 */
  gearLevel: number
}

export function scheduleNsBlocks(input: ScheduleNsInput): { automatic: SkillBlock[]; suggestions: NsSuggestion[] } {
  const { lane, student, rule, totalFrames, gearLevel } = input

  const ns = nsSkillFor(student, gearLevel)
  if (!ns) return { automatic: [], suggestions: [] }

  // 可选目标留空，交由建议确认界面选择。
  const policy = rules.targeting.policy(ns.Effects)

  const skillRef = gearLevel > 0 && student.Skills.G
    ? { kind: 'gear_public' as const }
    : { kind: 'public' as const }
  const targetIds = policy === 'select-ally' || policy === 'select-any' ? [] : rules.targeting.fixedTargetIds(policy, student.Id)

  const frames: number[] = []
  if (rule.kind === 'interval') {
    const step = rule.seconds * 30
    for (let frame = step; frame <= totalFrames; frame += step) frames.push(frame)
  } else {
    // attack_count：取第 count、2×count、… 次普攻的起始帧。
    // attackSimulation 已考虑轨道上的 EX 打断（NS 自身打断为二阶近似，暂忽略）。
    const attacks = simulateAttackSegments(lane, { totalFrames }).filter(segment => segment.type === 'attack')
    for (let index = rule.count - 1; index < attacks.length; index += rule.count) {
      frames.push(attacks[index].startFrame)
    }
  }

  const automatic: SkillBlock[] = [], suggestions: NsSuggestion[] = []
  frames.forEach((startFrame, index) => {
    const id = `${student.Id}-${skillRef.kind}-${index}`
    if (lane.skills.some(s => s.eventId === `ns-confirmed-${id}` || s.type === 'ns' && s.startFrame === startFrame && s.skillRef?.kind === skillRef.kind)) return
    const block: SkillBlock = {
    type: 'ns',
    name: ns.Name,
    startFrame,
    studentId: student.Id,
    targetId: targetIds[0] ?? student.Id,
    targetIds,
    skillRef,
    triggerSource: 'automatic',
    trigger: { source: 'automatic' },
    }
    if (automaticNsError(student, skillRef, ns.Effects, gearLevel, startFrame)) {
      const required = requiredTriggerReasons(ns.Effects)
      block.triggerSource = 'manual'
      block.trigger = { source: 'manual', reasons: [...new Set([...required, rule.kind === 'attack_count' ? 'action_event' as const : 'interval' as const])] }
      block.eventId = `ns-confirmed-${id}`
      suggestions.push({ id, slotIndex: lane.slotIndex, block })
    } else automatic.push({ ...block, eventId: `ns-auto-${student.Id}-${skillRef.kind}-${startFrame}` })
  })
  return { automatic, suggestions }
}
