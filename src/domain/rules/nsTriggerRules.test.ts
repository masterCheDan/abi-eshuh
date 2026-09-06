import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { StudentDB } from '../../types/student'
import { NS_TRIGGER_RULES, type NsTriggerRule } from './nsTriggerRules'

const database = studentData as unknown as StudentDB

/** 用与清单生成一致的规则，从 Desc 反推应有触发规则（不解析概率/其它触发）。 */
function expectedRule(studentId: number): NsTriggerRule | undefined {
  const student = database[String(studentId)]
  if (!student) return undefined

  let interval: number | undefined
  let attack: number | undefined
  for (const slot of ['P', 'G'] as const) {
    const skill = student.Skills[slot]
    if (!skill) continue
    const desc = skill.Desc ?? ''
    const intervalMatch = desc.match(/每(\d+)秒/)
    if (intervalMatch) interval = Number(intervalMatch[1])
    const attackMatch = desc.match(/自身每进行(\d+)次普通攻击/)
    if (attackMatch) attack = Number(attackMatch[1])
  }

  if (interval != null && attack == null) return { kind: 'interval', seconds: interval }
  if (attack != null && interval == null) return { kind: 'attack_count', count: attack }
  return undefined
}

describe('nsTriggerRules 覆盖测试', () => {
  it('清单与数据中所有 interval / attack_count NS 一一对应', () => {
    const expected: Record<number, NsTriggerRule> = {}
    for (const student of Object.values(database)) {
      const rule = expectedRule(student.Id)
      if (rule) expected[student.Id] = rule
    }
    expect(NS_TRIGGER_RULES).toEqual(expected)
  })
})
