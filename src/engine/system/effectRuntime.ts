import type { SkillEffect } from '../../types/student'
import type { EffectAuditRecord, EffectLedgerEntry, SkillRef, SummonInstance } from '../model/types'
import { rules } from '../../domain/rules/GameRules'

export type EffectTargetId = number | string

export interface ActiveEffect {
  id: number
  targetId: EffectTargetId
  sourceId: number
  skillRef: SkillRef
  effect: SkillEffect
  key: string
  expiresAt?: number
  uses: number
  stacks: number
  amount: number
}

export interface PendingEffect {
  actionId?: string
  frame: number
  issuerId: number
  skillRef: SkillRef
  effectIndex: number
  effect: SkillEffect
  targetIds: EffectTargetId[]
  /** 按目标分别选择数值行（如“目标是否持有指定状态”）；缺省用 valueRow。 */
  valueRowByTarget?: Map<EffectTargetId, number>
  conditionEndFrame?: number
  skillLevel: number
  valueRow: number
  isTick?: boolean
}

export interface PendingSummon {
  actionId?: string
  frame: number
  issuerId: number
  sourceEventId: string
  skillRef: SkillRef
  effectIndexes: number[]
  effects: SkillEffect[]
  valueRows: number[]
  skillLevel: number
}

/** 效果系统共享的运行时状态（Scheduler / Executor / Validator 共用一个实例）。 */
export interface EffectRuntimeState {
  onApplied?: (audit: EffectAuditRecord) => void
  onBeforeApply?: (pending: PendingEffect | PendingSummon) => boolean
  onControlChanged?: (frame: number) => void
  active: ActiveEffect[]
  pending: PendingEffect[]
  pendingSummons: PendingSummon[]
  summons: SummonInstance[]
  cycleCursor: Map<string, number>
  /** NS 技能族施放次数（键如 `${issuerId}:ns-family`），用于按次数选行。 */
  castCounts: Map<string, number>
  /** 层数衰减的下一次生效帧（键 `${issuerId}:${key}`）。 */
  decayNext: Map<string, number>
  /** 全队层数累计进度（键 sourceKey → 累计获得层数），用于阈值授予。 */
  layerGrantProgress: Map<string, number>
  nextId: number
  audit: EffectAuditRecord[]
  ledger: EffectLedgerEntry[]
}

export function effectAmount(effect: SkillEffect, level: number, valueRow: number): number {
  if (effect.Scale?.length) return effect.Scale[level - 1] ?? effect.Scale[effect.Scale.length - 1] ?? 0
  const values = effect.Value?.[valueRow] ?? effect.Value?.[0]
  return values?.[level - 1] ?? values?.[values.length - 1] ?? 0
}

export function effectKey(effect: SkillEffect): string {
  return typeof effect.StackLabel === 'string' ? effect.StackLabel : effect.Key ?? effect.Stat ?? effect.Type
}

export function durationToFrames(duration: number | undefined, endFrame: number | undefined, startFrame: number): number | undefined {
  if (duration == null) return undefined
  if (duration < 0) return endFrame == null ? undefined : Math.max(0, endFrame - startFrame)
  return Math.ceil(duration * 30 / 1000)
}

export function configuredDuration(effect: SkillEffect, key: string): number | undefined {
  return effect.Duration ?? rules.skill.specialRule(key)?.durationMs
}
