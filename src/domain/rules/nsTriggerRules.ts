/**
 * NS 触发清单（确定性触发）。
 *
 * 数据来源：原始数据中 NS（Public/GearPublic）的 Desc 文本，仅登记确定性的两种：
 *   - interval      每 X 秒触发
 *   - attack_count  自身每进行 N 次普通攻击触发
 *
 * 遵循 ruleManifest 哲学：不在运行时解析 Desc，触发周期/次数显式登记；
 * 由 nsTriggerRules.test.ts 覆盖测试保证清单与数据一致。
 */

import { catalog } from './catalog'

export type NsTriggerRule =
  | { kind: 'interval'; seconds: number }
  | { kind: 'attack_count'; count: number }

export const NS_TRIGGER_RULES: Readonly<Record<number, NsTriggerRule>> = catalog.ns as Record<number, NsTriggerRule>

/** 按学生 ID 查询 NS 确定性触发规则。 */
export function nsTriggerRule(studentId: number): NsTriggerRule | undefined {
  return NS_TRIGGER_RULES[studentId]
}
