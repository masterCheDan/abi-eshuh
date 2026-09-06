import type { SkillRef, SummonKind } from '../types'

export interface SummonRule {
  kind: SummonKind
  /** 同类单位的并存上限；缺省为 1。 */
  maxCount?: number
  /** 新生成时移除已有实例的范围。 */
  replaceScope: 'none' | 'owner' | 'vehicle'
  /** 原始 Effect 未提供 Duration 时采用的持续时间。 */
  durationMs?: number
  /** 同一学生的循环召唤组。 */
  cycle?: readonly number[]
  /** 特定技能一次产生的实例数。 */
  spawnCount?: (ref: SkillRef) => number
}

export const VEHICLES = new Set([30000, 30001, 30002, 30003, 30004, 30005, 36001])
export const COVERS = new Set([99997, 99998, 99999])

/**
 * 不从 Desc 推导。此表补足学生 Effect 数据缺失的实例语义。
 * 载具共用战场唯一槽；掩体按施法者唯一；其他单位默认按施法者唯一。
 */
export const SUMMON_RULES: Readonly<Record<number, SummonRule>> = {
  30000: { kind: 'vehicle', replaceScope: 'vehicle' },
  30001: { kind: 'vehicle', replaceScope: 'vehicle' },
  30002: { kind: 'vehicle', replaceScope: 'vehicle' },
  30003: { kind: 'vehicle', replaceScope: 'vehicle' },
  30004: { kind: 'vehicle', replaceScope: 'vehicle' },
  30005: { kind: 'vehicle', replaceScope: 'vehicle' },
  36001: { kind: 'vehicle', replaceScope: 'vehicle' },
  99997: { kind: 'cover', replaceScope: 'owner', durationMs: 40_000 },
  99998: { kind: 'cover', replaceScope: 'owner', durationMs: 40_000 },
  99999: { kind: 'cover', replaceScope: 'owner' },
  40002: { kind: 'summoned', replaceScope: 'owner' },
  40004: { kind: 'summoned', replaceScope: 'owner' },
  40005: { kind: 'summoned', replaceScope: 'none', spawnCount: ref => ref.kind === 'gear_public' ? 3 : 1 },
  40007: { kind: 'summoned', replaceScope: 'owner', durationMs: 32_000 },
  40009: { kind: 'summoned', replaceScope: 'none', maxCount: 5 },
  40011: { kind: 'summoned', replaceScope: 'owner' },
  40012: { kind: 'summoned', replaceScope: 'none', maxCount: 3, cycle: [40012, 40013, 40014] },
  40013: { kind: 'summoned', replaceScope: 'none', maxCount: 3, cycle: [40012, 40013, 40014] },
  40014: { kind: 'summoned', replaceScope: 'none', maxCount: 3, cycle: [40012, 40013, 40014] },
  40015: { kind: 'summoned', replaceScope: 'owner' },
}

export function summonRule(summonId: number): SummonRule {
  return SUMMON_RULES[summonId]
    ?? { kind: COVERS.has(summonId) ? 'cover' : VEHICLES.has(summonId) ? 'vehicle' : 'summoned', replaceScope: 'owner' }
}

export function summonDurationMs(summonId: number, effectDuration?: number): number | undefined {
  return effectDuration ?? summonRule(summonId).durationMs
}

/**
 * 队伍范围（AllyMain/AllySupport）Buff 同时覆盖在场召唤物的技能白名单。
 * 键为 `${studentId}:${SkillRef.kind}`；游戏数据的结构化 Effects 只写了
 * AllyMain/AllySupport，是否含召唤物仅体现在 Desc 文本中，因此显式登记。
 * 覆盖测试保证新出现的“及召唤物”技能不会被静默漏掉。
 */
export const ALLY_BUFF_INCLUDES_SUMMON: ReadonlySet<string> = new Set([
  '10129:ex', // 铃美（魔法）「这是，基础魔法！」
  '20051:public', // 玲纱（魔法）「糖分魔法压制！」
])
