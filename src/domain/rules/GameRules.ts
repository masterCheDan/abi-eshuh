/**
 * GameRules：所有游戏规则的统一只读入口。
 *
 * 各规则清单（EX 卡序 / 召唤 / CostOverload / 目标策略 / 触发 / 卡机制 /
 * 层数 / 数值行等）统一位于 domain/rules，外部（UI、引擎、测试）一律通过
 * 本门面查询，不再直接 import 具体清单模块。
 */
import type { Student, SkillEffect } from '../../types/student'
import type { SkillRef } from '../types'
import { catalog, effectPolicy } from './catalog'
import { EX_CARD_RULES, EX_CARD_DESCRIPTION_PATTERN } from './exCardRules'
import type { ExCardRuleSpec } from './exCardRules'
import { COST_OVERLOAD_RULES, applyCostOverloadRule, COST_OVERLOAD_DESCRIPTION_PATTERN } from './costOverloadRules'
import { ALLY_BUFF_INCLUDES_SUMMON, COVERS, SUMMON_RULES, VEHICLES, summonDurationMs, summonRule } from './summonRules'
import { DISPEL_RULES, SELF_EX_BUFF_EP_IDS, SPECIAL_RULES, STAT_POLICY } from './ruleManifest'
import { fixedSkillTargetIds, normalizedEffectTargets, skillRequiresManualTarget, skillTargetPolicy } from './skillTargeting'
import { automaticTriggerSpecs } from './triggerSpecs'
import { CARD_MECHANICS, cardMechanic } from './cardMechanics'
import { DYNAMIC_DAMAGE_RULES, LAYER_CAPS, LAYER_DECAYS, LAYER_GRANTS } from './layerRules'
import { VALUE_ROW_RULES, valueRowRule } from './valueRowRules'
import { NS_TRIGGER_RULES, nsTriggerRule } from './nsTriggerRules'
import { inspectStudentActionData } from './actionRules'
import { nsSchedulingEligibility, validateNsSchedulingConfig } from './nsSchedulingRules'

export type {
  ExCardFeature,
  ExCardRuleSpec,
} from './exCardRules'
export type { SkillTargetPolicy } from './skillTargeting'
export type { SummonRule } from './summonRules'
export type { CostOverloadRule } from './costOverloadRules'
export type { TriggerMode, TriggerSpec } from './ruleManifest'
export type {
  CardMechanic,
  CardMechanicState,
  CardPlayContext,
  TransformCardMechanic,
  FriendMarkerCardMechanic,
  BehaviorCardMechanic,
} from './cardMechanics'
export type { DynamicDamageRule } from './layerRules'
export type { ValueRowRule, ValueRowSkillRef } from './valueRowRules'
export type { NsTriggerRule } from './nsTriggerRules'

export const rules = {
  catalog,
  nsScheduling: {
    version: catalog.nsScheduling.version,
    policies: catalog.nsScheduling.policies,
    eligibility: nsSchedulingEligibility,
    validateConfig: validateNsSchedulingConfig,
  },
  action: {
    version: catalog.actions.version,
    inspect: inspectStudentActionData,
    pendingInterruption: catalog.actions.pendingInterruption,
  },
  card: {
    get(studentId: number) {
      return EX_CARD_RULES[studentId]
    },
    has(studentId: number): boolean {
      return EX_CARD_RULES[studentId] != null
    },
    descriptionPattern: EX_CARD_DESCRIPTION_PATTERN,
    rules: EX_CARD_RULES,
  },
  skill: {
    effectPolicy,
    specialRule(key: string) {
      return SPECIAL_RULES[key]
    },
    selfExBuffEpIds: SELF_EX_BUFF_EP_IDS,
  },
  targeting: {
    policy: skillTargetPolicy,
    requiresManualTarget: skillRequiresManualTarget,
    normalizedTargets: normalizedEffectTargets,
    fixedTargetIds: fixedSkillTargetIds,
  },
  summon: {
    rule: summonRule,
    durationMs: summonDurationMs,
    rules: SUMMON_RULES,
    allyBuffIncludesSummon: ALLY_BUFF_INCLUDES_SUMMON,
    vehicles: VEHICLES,
    covers: COVERS,
  },
  cost: {
    overloadRule(studentId: number) {
      return COST_OVERLOAD_RULES[studentId]
    },
    applyOverload(studentId: number, ref: SkillRef, effects: readonly SkillEffect[]): SkillEffect[] {
      return applyCostOverloadRule(studentId, ref, effects)
    },
    overloadDescriptionPattern: COST_OVERLOAD_DESCRIPTION_PATTERN,
    rules: COST_OVERLOAD_RULES,
  },
  trigger: {
    automatic: automaticTriggerSpecs,
  },
  nsTrigger: {
    rule: nsTriggerRule,
    rules: NS_TRIGGER_RULES,
  },
  mechanics: {
    cardMechanic,
    cardMechanics: CARD_MECHANICS,
    layerCaps: LAYER_CAPS,
    layerDecays: LAYER_DECAYS,
    layerGrants: LAYER_GRANTS,
    dynamicDamageRules: DYNAMIC_DAMAGE_RULES,
    valueRowRule,
    valueRowRules: VALUE_ROW_RULES,
    dispelDefault: DISPEL_RULES.default,
    statPolicy: STAT_POLICY,
  },
}

/** 供类型标注使用：规则门面形状。 */
export type GameRules = typeof rules

export function exCardRule(student: Student | number): ExCardRuleSpec | undefined {
  return rules.card.get(typeof student === 'number' ? student : student.Id)
}
