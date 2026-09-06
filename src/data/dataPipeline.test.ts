import { describe, expect, it } from 'vitest'
import rawStudentJson from '../../data/students.json?raw'
import testStudents from './students.min.json' with { type: 'json' }
import runtimeStudents from '../../public/data/students.min.json' with { type: 'json' }
import testBosses from './bosses.min.json' with { type: 'json' }
import runtimeBosses from '../../public/data/bosses.min.json' with { type: 'json' }

describe('data pipeline', () => {
  it('produces identical runtime/test students and preserves every raw normal attack branch', () => {
    expect(runtimeStudents).toEqual(testStudents)
    const raw = JSON.parse(rawStudentJson) as Record<string, { Skills: { Normal?: unknown } }>
    const generated = testStudents as Record<string, { Skills: { N: unknown } }>
    expect(Object.keys(generated)).toEqual(Object.keys(raw))
    for (const [id, student] of Object.entries(raw))
      expect(generated[id].Skills.N, id + ':N').toEqual(student.Skills.Normal ?? null)
  })

  it('produces identical bosses.min.json for test and runtime', () => {
    expect(runtimeBosses).toEqual(testBosses)
  })
})
