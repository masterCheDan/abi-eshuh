/**
 * 受版本控制的学生规则入口。这里永远不读取 Desc；数据不足的能力以
 * explicit manual 规则登记，防止调度器把外部战况误判为确定事件。
 */
import type { SkillRef } from '../model/types'
import type { SkillEffect, Student } from '../../types/student'

export type TriggerMode = 'battle_start' | 'manual'
export interface TriggerSpec {
  mode: TriggerMode
  skillRef: SkillRef
  reasons?: readonly string[]
  /** Only these source effects belong to the opening clause. Omitted means all. */
  effectIndices?: readonly number[]
  /** Structured effects missing from the source Effects array. */
  syntheticEffects?: readonly SkillEffect[]
  /** Direct Cost grant; distinct from CostChange and indexed by NS level. */
  initialCostByLevel?: readonly number[]
}

const BATTLE_START_EP_IDS = new Set([
  20000, 20001, 20002, 23000, 23001, 23002, 23003, 23004, 23005, 26000, 26001, 26002, 26003, 26004, 26005,
  20003, 23006, 10016, 13011, 10017, 26006, 23007, 20004, 20005, 20006, 23008, 20007, 20008, 20009, 20010,
  20011, 20012, 20013, 20014, 20015, 20016, 16009, 20017, 26007, 26008, 10048, 20018, 20019, 20020, 10055,
  20021, 20022, 10059, 20023, 20024, 20025, 10066, 26009, 20026, 10072, 26010, 20027, 20028, 20029, 13013,
  20030, 20031, 26011, 20032, 20033, 10088, 20034, 20035, 20036, 10096, 20037, 26012, 10099, 10100, 26013,
  20038, 20039, 10105, 10106, 20040, 10112, 26014, 10111, 20041, 20042, 10113, 20043, 10115, 20044, 10118,
  20045, 20046, 10121, 20047, 26015, 20048, 10122, 10125, 10126, 20049, 20050, 20051, 20052, 20053, 20054,
  10134, 20055, 20056, 10138, 20057, 10140, 16020, 20058, 20059, 10142,
])

type OpeningRule = Pick<TriggerSpec, 'effectIndices' | 'syntheticEffects' | 'initialCostByLevel'>

const BATTLE_START_PUBLIC_RULES: Readonly<Record<number, OpeningRule & { kind: 'public' | 'gear_public' }>> = {
  10011: { kind: 'public', effectIndices: [], initialCostByLevel: [2, 2.1, 2.2, 2.6, 2.7, 2.8, 3.2, 3.3, 3.4, 3.8] },
  10015: { kind: 'gear_public', effectIndices: [], syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'EnergyBatteryHalf' }] },
  10086: { kind: 'public' },
  20027: { kind: 'public' },
  20053: { kind: 'public' },
}

const BATTLE_START_EP_OVERRIDES: Readonly<Record<number, OpeningRule>> = {
  // These Damage entries describe a persistent normal-attack rewrite, not an opening hit.
  10055: { effectIndices: [], syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'NormalAttackAreaOverride_Shigure', Scale: [6167, 6290, 6414, 6909, 7033, 7157, 7644, 7768, 7892, 8387] }] },
  10066: { effectIndices: [], syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'NormalAttackOverride_MaidAris' }] },
  10113: { effectIndices: [], syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'NormalAttackAreaOverride_CasualSena', Scale: [6167, 6290, 6414, 6909, 7033, 7157, 7644, 7768, 7892, 8387] }] },

  // Only the listed effects belong to the opening clause; later effects need user facts.
  10099: { effectIndices: [0], syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'IgnoreDefense', Scale: [6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 8500] }] },
  10105: { effectIndices: [1] },
  10115: { effectIndices: [0] },
  10121: { effectIndices: [0] },
  10140: { effectIndices: [0] },

  // Opening mechanics absent from source Effects are retained as auditable states.
  10059: { syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'GuaranteedCritical' }] },
  10118: { syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'GuaranteedCritical' }] },
  10134: { syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'AllDamageCountsAsEx' }] },
  16020: { syntheticEffects: [{ Type: 'Special', Target: 'Self', Key: 'NormalDamageScalesWithExBuff' }] },
}

export function triggerSpecsFor(student: Student): readonly TriggerSpec[] {
  const specs: TriggerSpec[] = [
    { mode: 'battle_start', skillRef: { kind: 'passive' } },
    { mode: 'battle_start', skillRef: { kind: 'weapon_passive' } },
    { mode: 'manual', skillRef: { kind: 'public' }, reasons: ['interval', 'chance', 'action_event', 'hp_threshold'] },
    { mode: 'manual', skillRef: { kind: 'extra_passive' }, reasons: ['action_event', 'hp_threshold', 'external_state'] },
  ]
  if (student.HasGear && student.Skills.G) specs.push({ mode: 'manual', skillRef: { kind: 'gear_public' }, reasons: ['interval', 'chance', 'action_event', 'hp_threshold'] })
  const publicRule = BATTLE_START_PUBLIC_RULES[student.Id]
  if (publicRule) {
    const { kind, ...rule } = publicRule
    specs.push({ mode: 'battle_start', skillRef: { kind }, ...rule })
  }
  if (BATTLE_START_EP_IDS.has(student.Id)) {
    specs.push({ mode: 'battle_start', skillRef: { kind: 'extra_passive' }, ...BATTLE_START_EP_OVERRIDES[student.Id] })
  }
  for (const [extraSkillIndex, extra] of (student.Skills.E.ExtraSkills ?? []).entries()) {
    specs.push({ mode: 'manual', skillRef: extra.Id ? { kind: 'extra_ex', extraSkillId: extra.Id } : { kind: 'extra_ex', extraSkillIndex }, reasons: ['external_state'] })
  }
  return specs
}

/** 表驱动例外：新增特例必须在此登记，而非从自然语言描述推断。 */
export const SPECIAL_RULES: Readonly<Record<string, { unlocksExtraEx?: boolean; durationMs?: number }>> = {
  FormChange: { unlocksExtraEx: true },
  Fury: {}, SilverBullet: {}, CH0187Mod: {}, CH0224_Public: {}, CH0239_ExtraPassive: {},
  CH0280_Ex_01: { unlocksExtraEx: true, durationMs: 70_000 }, CH0309_Ex: {}, AmplifyDoTReducePeriod_Chill: {}, AmplifyDoTAdditionalTick_Poison: {},
  EnergyBatteryHalf: {}, NormalAttackAreaOverride_Shigure: {}, NormalAttackOverride_MaidAris: {},
  NormalAttackAreaOverride_CasualSena: {}, IgnoreDefense: {}, GuaranteedCritical: {},
  AllDamageCountsAsEx: {}, NormalDamageScalesWithExBuff: {},
  CostOverload: {},
  '(none)': {},
}

/** 所有当前学生数据中的 Stat 均显式登记；除 Cost 再生外作为通用状态修正器保存。 */
export const STAT_POLICY = new Set([
  'AccuracyPoint_Base', 'AccuracyPoint_Coefficient', 'AmmoCount_Base', 'AttackPower_Base', 'AttackPower_Coefficient', 'AttackSpeed_Base', 'AttackSpeed_Coefficient', 'BlockRate_Base', 'ChillDamagedIncrease_Coefficient', 'CriticalChanceResistPoint_Coefficient', 'CriticalDamageRate_Base', 'CriticalDamageRate_Coefficient', 'CriticalDamageResistRate_Base', 'CriticalDamageResistRate_Coefficient', 'CriticalPoint_Base', 'CriticalPoint_BaseOuter', 'CriticalPoint_Coefficient', 'DamageRatio2_Coefficient', 'DamagedRatio2_Coefficient', 'DefensePenetration_Base', 'DefensePower_Base', 'DefensePower_Coefficient', 'DodgePoint_Base', 'DodgePoint_Coefficient', 'EnhanceBasicsDamageRate_Base', 'EnhanceExDamageRate_Base', 'EnhanceExplosionRate_Base', 'EnhanceMysticRate_Base', 'EnhancePierceRate_Base', 'EnhanceSonicRate_Base', 'ExtendBuffDuration_Base', 'ExtendDebuffDuration_Base', 'ExtendDebuffDuration_Coefficient', 'HealEffectivenessRate_Base', 'HealEffectivenessRate_Coefficient', 'HealPower_Base', 'HealPower_Coefficient', 'IgnoreDelayCount_Base', 'MaxHP_Base', 'MaxHP_Coefficient', 'MoveSpeed_Coefficient', 'OppressionPower_Base', 'OppressionPower_Coefficient', 'OppressionResist_Coefficient', 'Range_Base', 'Range_Coefficient', 'ReduceWeakDamagedRate_Base', 'RegenCost_Base', 'RegenCost_Coefficient', 'StabilityPoint_Base',
])

/** 数据没有细分驱散类别时的确定性默认：移除学生侧所有可驱散状态。 */
export const DISPEL_RULES: Readonly<Record<string, readonly string[]>> = {
  default: ['Buff', 'DamageDebuff', 'Shield', 'CrowdControl', 'Knockback', 'Summon', 'Special', 'Accumulation', 'ConcentratedTarget', 'CostChange'],
}
