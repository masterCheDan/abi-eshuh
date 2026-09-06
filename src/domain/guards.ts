import type { SkillDefinition, StudentDefinition, TargetSpec } from './types'

export function isTargetSpec(value: unknown): value is TargetSpec {
  if (!value || typeof value !== 'object') return false
  const spec = value as TargetSpec
  return typeof spec.policy === 'string'
}

export function isSkillDefinition(value: unknown): value is SkillDefinition {
  if (!value || typeof value !== 'object') return false
  const skill = value as SkillDefinition
  return !!skill.ref
    && typeof skill.ref.kind === 'string'
    && typeof skill.name === 'string'
    && Array.isArray(skill.effects)
}

export function isStudentDefinition(value: unknown): value is StudentDefinition {
  if (!value || typeof value !== 'object') return false
  const student = value as StudentDefinition
  return typeof student.id === 'number'
    && typeof student.name === 'string'
    && Array.isArray(student.skills)
    && student.skills.every(skill => isSkillDefinition(skill))
}
