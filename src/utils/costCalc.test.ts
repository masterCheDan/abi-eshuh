import { describe, expect, it } from 'vitest'
import studentData from '../data/students.min.json' with { type: 'json' }
import type { StudentDB } from '../types/student'
import { skillBaseCost } from './costCalc'

const database = studentData as unknown as StudentDB

/** 数据中 EX Cost 随技能等级变化的学生。 */
const LEVEL_DEPENDENT: Array<[string, string]> = [
  ['10002', '晴奈'],
  ['10017', '切里诺'],
  ['10035', '忧'],
  ['10045', '星野（泳装）'],
  ['20012', '濑名'],
  ['20016', '伊吕波'],
  ['20022', '枫香（正月）'],
  ['20031', '时雨（温泉）'],
  ['26011', '佐天泪子'],
]

describe('skillBaseCost', () => {
  it('uses the leveled EX cost for every level-dependent student', () => {
    for (const [id] of LEVEL_DEPENDENT) {
      const student = database[id]
      expect(student, id).toBeDefined()
      for (let level = 1; level <= 5; level++) {
        expect(skillBaseCost(student, { kind: 'ex' }, level), `${id} L${level}`)
          .toBe(student.Skills.E.Cost[level - 1])
      }
    }
  })

  it('resolves extra_ex cost from the matching ExtraSkill at the selected level', () => {
    const student = database['10143'] // 瞬（泳装）
    expect(student).toBeDefined()
    const extra = student.Skills.E.ExtraSkills?.[0]
    expect(extra?.Id).toBeTruthy()
    if (!extra?.Id) return
    for (let level = 1; level <= 5; level++) {
      expect(skillBaseCost(student, { kind: 'extra_ex', extraSkillId: extra.Id }, level))
        .toBe(extra.Cost[level - 1] ?? extra.Cost[0] ?? 0)
    }
  })

  it('falls back to the base EX Cost[0] for an unknown extra_ex ref', () => {
    const student = database['10143']
    expect(skillBaseCost(student, { kind: 'extra_ex', extraSkillId: 'NO_SUCH_EX' }, 5))
      .toBe(student.Skills.E.Cost[0])
  })
})
