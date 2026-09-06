import { catalog } from './catalog'
/**
 * 层数状态规则（乐队体系 CH0220_Public / CH0221_ExtraPassive）。
 * 人工核对技能 Desc 后显式登记；施放源由 gameDataBuilder 追加到学生 EX Effects。
 */

export interface DynamicDamageRule {
  skillRefs: readonly ('public' | 'gear_public' | 'extra_passive')[]
  /** 全队层数倍率（10092 Public：100% + 全体层数×5%，上限 8 层）。 */
  kind: 'team-layer-multiplier' | 'self-layer-multiplier'
  key: string
  perLayer?: number
  maxLayers?: number
}

export const LAYER_CAPS: Readonly<Record<string, number>> = catalog.band.caps
export const LAYER_DECAYS: ReadonlyArray<{ issuerId: number; key: string; everyMs: number; remove: number }> = catalog.band.decays
export const LAYER_GRANTS: ReadonlyArray<{ issuerId: number; sourceKey: string; perLayers: number; targetKey: string; cap: number }> = catalog.band.grants
export const DYNAMIC_DAMAGE_RULES: Readonly<Record<number, DynamicDamageRule>> = catalog.band.damage as Record<number, DynamicDamageRule>
