/**
 * EX card-order rules that are not represented by structured Effects data.
 *
 * Runtime code must never infer these mechanics from Desc.  The description
 * matcher is exported only for the data-coverage test so newly added students
 * cannot silently bypass this manifest.
 */

export type ExCardFeature =
  | 'conditional_self_redraw'
  | 'external_executor'
  | 'fixed_sequence'
  | 'self_redraw_and_transform'
  | 'copy_target_card'
  | 'rapid_fire_and_move_to_tail'
  | 'self_redraw_and_charge'

export interface ExCardRuleSpec {
  features: readonly ExCardFeature[]
  extraSkillIds?: readonly string[]
}

export const EX_CARD_RULES: Readonly<Record<number, ExCardRuleSpec>> = {
  // 水位计计数不低于 1 时重新抓取自身 EX；水位计由其他学生使用 EX 累积。
  10074: { features: ['conditional_self_redraw'] },
  // 固定三段 0 Cost EX，形态持续 10 秒且每段刷新持续时间。
  10086: {
    features: ['fixed_sequence'],
    extraSkillIds: ['CH0230Ex02', 'CH0230Ex03', 'CH0230Ex04'],
  },
  // 1 Cost EX 重新抓取并在 70 秒内切换为攻击 EX。
  10111: {
    features: ['self_redraw_and_transform'],
    extraSkillIds: ['CH0280Ex02'],
  },
  // 连射期间固定自身卡；结束或超时后移至当前牌序末尾。
  10122: {
    features: ['rapid_fire_and_move_to_tail'],
    extraSkillIds: ['CH0294Ex01', 'CH0294Ex03', 'CH0294Ex02'],
  },
  // 充能技能重新抓取自身卡；攻击技能消费该卡。
  10134: {
    features: ['self_redraw_and_charge'],
    extraSkillIds: ['CH0334Ex01', 'CH0334Ex04'],
  },
  // 卡牌属于伊吹、执行主体为虎丸；由用户确认搭乘状态。
  16014: {
    features: ['external_executor'],
    extraSkillIds: ['CH0077RidingEx01'],
  },
  // 泳装瞬：EX 立即重新抓取自身卡，9 秒内 EX 变为攻击技能；超时后移至牌序末尾。
  10143: {
    features: ['self_redraw_and_transform'],
    extraSkillIds: ['CH0355_01Ex02'],
  },
  // 重新抓取莉音的卡并复制所选 STRIKER 的当前 EX 状态，一次后还原。
  20041: { features: ['copy_target_card'] },
  // 泳装伊吹：EX 重新抓取自身卡，本场战斗 EX 变为辅助技能。
  20060: {
    features: ['self_redraw_and_transform'],
    extraSkillIds: ['CH0347Ex02'],
  },
}

/** Coverage-only marker. It is deliberately not called by the simulation. */
export const EX_CARD_DESCRIPTION_PATTERN =
  /(重新抓取|立即抓取EX技能牌|固定EX技能牌|牌序末尾|技能牌复制|技能牌.*改为|技能从属主体\(EX技能牌\))/
