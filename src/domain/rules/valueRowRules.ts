import type { School } from '../../types/student'

/**
 * ExtraPassive 多行 Value 的编队条件选择规则（表单条件）。
 * 配置驱动，替代 EffectScheduler.resolveValueRow 里的 per-student 判断。
 */
export type ValueRowSkillRef = 'public' | 'gear_public' | 'extra_passive'

interface ValueRowRuleBase {
  /** 规则适用的技能类型；缺省仅 extra_passive（历史行为）。 */
  skillRefs?: readonly ValueRowSkillRef[]
  /** 仅对指定 Stat 的效果生效；缺省不限制。 */
  stat?: string
}

export type ValueRowRule =
  | (ValueRowRuleBase & { kind: 'name-prefix'; prefix: string; matchRow: number; otherRow: number })
  | (ValueRowRuleBase & { kind: 'school-count'; school: School; offset: number; cap: number; minCount?: number })
  | (ValueRowRuleBase & { kind: 'name-pattern'; pattern: string; offset: number; cap: number; excludeSelf?: boolean })
  | (ValueRowRuleBase & { kind: 'heavy-armor-main-count'; cap: number })
  /** 按技能施放次数选行（第 N 次 → 行 N-1）；maxUses 同时作为施放上限。 */
  | (ValueRowRuleBase & { kind: 'cast-count'; maxUses: number })
  /** 按目标是否已持有指定 Special 状态选行（rows[0]=未持有，rows[1]=持有）。 */
  | (ValueRowRuleBase & { kind: 'target-has-special'; key: string; rows: [number, number] })
  /** 按施放者持有的层数状态选行（行 = min(层数, 行数-1)）。 */
  | (ValueRowRuleBase & { kind: 'layer-index'; key: string })

export const VALUE_ROW_RULES: Readonly<Record<number, ValueRowRule>> = {
  10016: { kind: 'name-prefix', prefix: '桃井', matchRow: 1, otherRow: 0 },
  13011: { kind: 'name-prefix', prefix: '绿', matchRow: 1, otherRow: 0 },
  10017: { kind: 'school-count', school: 'RedWinter', offset: -1, cap: 3 },
  10048: { kind: 'school-count', school: 'Arius', offset: -2, cap: 2, minCount: 2 },
  // 满：编队内忍研学生数（不含自身，最多 3）决定 EP/强化 NS 的数值行。
  16009: { kind: 'name-pattern', pattern: '^(满|泉奈|月咏)', offset: 0, cap: 3, excludeSelf: true, skillRefs: ['extra_passive', 'gear_public'] },
  10126: { kind: 'heavy-armor-main-count', cap: 3 },
  // 若藻（泳装）：NS 第 1/2/3 次分别取行 0/1/2，满 3 次后禁止再施放。
  10043: { kind: 'cast-count', maxUses: 3, skillRefs: ['public', 'gear_public'] },
  // 和纱（乐队）：强化 NS 按每个目标是否持有 CH0220_Public 选行。
  10091: { kind: 'target-has-special', key: 'CH0220_Public', rows: [0, 1], skillRefs: ['gear_public'], stat: 'EnhanceExplosionRate_Base' },
  // 夏（乐队）EP：按自身 CH0221_ExtraPassive 层数在 5 行中选行。
  10120: { kind: 'layer-index', key: 'CH0221_ExtraPassive', skillRefs: ['extra_passive'], stat: 'AttackPower_Coefficient' },
}

export function valueRowRule(studentId: number): ValueRowRule | undefined {
  return VALUE_ROW_RULES[studentId]
}
