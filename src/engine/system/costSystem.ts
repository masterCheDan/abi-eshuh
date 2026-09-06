/**
 * Cost 系统 (Engine 层)
 *
 * 迁移自 utils/costCalc.ts，抽离为纯 TS 无副作用模块。
 *
 * 规则:
 * - 常规战斗 max=10, 限制解除决战 max=20
 * - 每名学生基础 Regen=700, 10000 回复力 = 每秒 +1 Cost
 * - EX 施放扣减 Cost[0], 帧间逐步恢复
 * - CostChange 由 StudentEffectSystem 修改 EX 费用；只有 RegenCost Buff 修改回复力
 *
 * 整数模型：
 * - 为避免浮点误差，内部 Cost 统一放大 COST_SCALE 倍存储。
 * - 选择 300000 = 10*30*1000? 实际为 10000*30，保证每帧回复量为整数 Regen。
 */

import type { Student } from '../../types/student'
import type { Formation } from '../model/types'

export const COST_SCALE = 300000
export const UNIQUE_WEAPON_4_SUPPORT_MAX_COST_BONUS = COST_SCALE / 2

export function baseMaxCost(mode: Formation['mode']): number {
  return (mode === 'normal' ? 10 : 20) * COST_SCALE
}

/** SPECIAL 的专武4效果可叠加；STRIKER 的专武4不改变 Cost 上限。 */
export function formationMaxCost(
  formation: Pick<Formation, 'mode' | 'slots' | 'uniqueWeaponLevels'>,
  students: ReadonlyMap<number, Student>,
): number {
  const supportWeapon4Count = formation.slots.reduce<number>((count, studentId, slotIndex) => {
    if (studentId == null || (formation.uniqueWeaponLevels?.[slotIndex] ?? 0) < 4) return count
    return students.get(studentId)?.SquadType === 'Support' ? count + 1 : count
  }, 0)
  return baseMaxCost(formation.mode)
    + supportWeapon4Count * UNIQUE_WEAPON_4_SUPPORT_MAX_COST_BONUS
}
