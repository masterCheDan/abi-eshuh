import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/data/students.min.json', import.meta.url)))
const handledEffects = new Set(['Buff', 'Damage', 'Heal', 'CrowdControl', 'DamageDebuff', 'Regen', 'Summon', 'Special', 'Shield', 'CostChange', 'Dispel', 'Knockback', 'ConcentratedTarget', 'Accumulation'])
const handledConditions = new Set(['BuffCount', 'Special', 'TargetProp', 'SkillLevel'])
const handledTargets = new Set(['Self', 'Enemy', 'Ally', 'AllyMain', 'AllySupport', 'Any'])
const handledStats = new Set(['AccuracyPoint_Base', 'AccuracyPoint_Coefficient', 'AmmoCount_Base', 'AttackPower_Base', 'AttackPower_Coefficient', 'AttackSpeed_Base', 'AttackSpeed_Coefficient', 'BlockRate_Base', 'ChillDamagedIncrease_Coefficient', 'CriticalChanceResistPoint_Coefficient', 'CriticalDamageRate_Base', 'CriticalDamageRate_Coefficient', 'CriticalDamageResistRate_Base', 'CriticalDamageResistRate_Coefficient', 'CriticalPoint_Base', 'CriticalPoint_BaseOuter', 'CriticalPoint_Coefficient', 'DamageRatio2_Coefficient', 'DamagedRatio2_Coefficient', 'DefensePenetration_Base', 'DefensePower_Base', 'DefensePower_Coefficient', 'DodgePoint_Base', 'DodgePoint_Coefficient', 'EnhanceBasicsDamageRate_Base', 'EnhanceExDamageRate_Base', 'EnhanceExplosionRate_Base', 'EnhanceMysticRate_Base', 'EnhancePierceRate_Base', 'EnhanceSonicRate_Base', 'ExtendBuffDuration_Base', 'ExtendDebuffDuration_Base', 'ExtendDebuffDuration_Coefficient', 'HealEffectivenessRate_Base', 'HealEffectivenessRate_Coefficient', 'HealPower_Base', 'HealPower_Coefficient', 'IgnoreDelayCount_Base', 'MaxHP_Base', 'MaxHP_Coefficient', 'MoveSpeed_Coefficient', 'OppressionPower_Base', 'OppressionPower_Coefficient', 'OppressionResist_Coefficient', 'Range_Base', 'Range_Coefficient', 'ReduceWeakDamagedRate_Base', 'RegenCost_Base', 'RegenCost_Coefficient', 'StabilityPoint_Base'])
const handledSpecials = new Set(['FormChange', 'Fury', 'SilverBullet', 'CH0187Mod', 'CH0224_Public', 'CH0239_ExtraPassive', 'CH0280_Ex_01', 'CH0309_Ex', 'AmplifyDoTReducePeriod_Chill', 'AmplifyDoTAdditionalTick_Poison', '(none)'])
const handledCostValueTypes = new Set(['BaseAmount', 'Coefficient'])
const unknown = { effects: new Set(), conditions: new Set(), targets: new Set(), stats: new Set(), specials: new Set(), costValueTypes: new Set(), triggers: new Set() }

for (const student of Object.values(data)) {
  const skills = Object.entries(student.Skills ?? {})
  for (const [kind, skill] of skills) {
    if (!skill || typeof skill !== 'object') continue
    const variants = [skill, ...(skill.ExtraSkills ?? [])]
    for (const variant of variants) for (const effect of variant.Effects ?? []) {
      if (!handledEffects.has(effect.Type)) unknown.effects.add(effect.Type)
      if (effect.Condition?.Type && !handledConditions.has(effect.Condition.Type)) unknown.conditions.add(effect.Condition.Type)
      for (const target of (Array.isArray(effect.Target) ? effect.Target : effect.Target == null ? [] : [effect.Target])) if (!handledTargets.has(target)) unknown.targets.add(target)
      if (effect.Stat && !handledStats.has(effect.Stat)) unknown.stats.add(effect.Stat)
      if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(effect.Type) && !handledSpecials.has(effect.Key ?? effect.Stat ?? '(none)')) unknown.specials.add(effect.Key ?? effect.Stat ?? '(none)')
      if (effect.Type === 'CostChange' && !handledCostValueTypes.has(effect.ValueType)) unknown.costValueTypes.add(effect.ValueType ?? '(missing)')
    }
    if (['P', 'G', 'EP'].includes(kind) && !skill.Name) unknown.triggers.add(`${student.Id}:${kind}`)
  }
}
if (Object.values(unknown).some(set => set.size)) {
  console.error('Unhandled student rule data:', Object.fromEntries(Object.entries(unknown).map(([key, value]) => [key, [...value]])))
  process.exit(1)
}
console.log('Student effect, condition, target, stat, special, CostChange value type, and trigger coverage OK')
