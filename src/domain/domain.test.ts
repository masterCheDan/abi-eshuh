import { describe, expect, it } from 'vitest'
import studentData from '../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../types/student'
import { isStudentDefinition } from './guards'
import { studentDefinition } from './student'
import { getExSkillView } from './SkillViewService'
import type { SquadSlot } from '../types/squad'

const database = studentData as unknown as StudentDB

describe('domain definitions', () => {
  it('maps a data student to a StudentDefinition without rule derivation', () => {
    const definition = studentDefinition(database['10045'] as Student)
    expect(definition.id).toBe(10045)
    expect(definition.name).toBe('星野（泳装）')
    expect(definition.skills.find(skill => skill.ref.kind === 'ex')?.name).toBe('水上支援')
    expect(isStudentDefinition(definition)).toBe(true)
  })

  it('exposes extra EX skills as separate definitions', () => {
    const definition = studentDefinition(database['10143'] as Student)
    const extra = definition.skills.find(skill => skill.ref.kind === 'extra_ex')
    expect(extra?.ref).toEqual({ kind: 'extra_ex', extraSkillId: 'CH0355_01Ex02' })
    expect(extra?.name).toBe('要认真听我说哦？')
  })
})

describe('SkillViewService', () => {
  const squad = (students: Student[]): SquadSlot[] =>
    students.map((student, index) => ({
      index,
      slotType: index < 2 ? 'Main' : 'Support',
      label: '',
      student,
      locked: true,
      exLevel: 5,
      nsLevel: 10,
      ssLevel: 10,
      starLevel: 3,
      uniqueWeaponLevel: 0,
      gearLevel: 1,
    }))

  it('builds an EX view with overload-adjusted targeting and Main-only options', () => {
    const striker = database['10045'] as Student
    const view = getExSkillView(striker, squad([striker, database['10035'] as Student]), { kind: 'ex' }, 5, 'Boss')
    expect(view?.name).toBe('水上支援')
    expect(view?.targeting.policy).toBe('formation')
    expect(view?.isManualTarget).toBe(false)

    const overloaded = getExSkillView(database['20048'] as Student, squad([striker, database['10035'] as Student]), { kind: 'ex' }, 5, 'Boss')
    expect(overloaded?.targeting.policy).toBe('select-ally')
    expect(overloaded?.targeting.max).toBe(1)
    expect(overloaded?.availableTargets.every(option => option.id !== -1)).toBe(true)
  })

  it('builds an extra EX view without manual targets for empty effects', () => {
    const student = database['10143'] as Student
    const view = getExSkillView(student, squad([student]), { kind: 'extra_ex', extraSkillId: 'CH0355_01Ex02' }, 5, 'Boss')
    expect(view?.name).toBe('要认真听我说哦？')
    expect(view?.isManualTarget).toBe(false)
  })
})
