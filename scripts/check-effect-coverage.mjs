import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/data/students.min.json', import.meta.url)))
const handledEffects = new Set([
  'Buff', 'Damage', 'Heal', 'CrowdControl', 'DamageDebuff', 'Regen', 'Summon',
  'Special', 'Shield', 'CostChange', 'Dispel', 'Knockback', 'ConcentratedTarget', 'Accumulation',
])
const handledConditions = new Set(['BuffCount', 'Special', 'TargetProp', 'SkillLevel'])
const unknownEffects = new Set()
const unknownConditions = new Set()

for (const student of Object.values(data)) {
  for (const skill of Object.values(student.Skills ?? {})) {
    for (const effect of skill?.Effects ?? []) {
      if (!handledEffects.has(effect.Type)) unknownEffects.add(effect.Type)
      if (effect.Condition && typeof effect.Condition === 'object' && effect.Condition.Type && !handledConditions.has(effect.Condition.Type)) {
        unknownConditions.add(effect.Condition.Type)
      }
    }
  }
}

if (unknownEffects.size || unknownConditions.size) {
  console.error('Unhandled student effect data:', { effects: [...unknownEffects], conditions: [...unknownConditions] })
  process.exit(1)
}
console.log('Student effect coverage OK')
