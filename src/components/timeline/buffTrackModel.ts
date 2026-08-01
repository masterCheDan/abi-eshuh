import type { EffectAuditRecord } from '../../engine/model/types'

export const VISIBLE_EFFECT_TYPES = new Set([
  'Buff',
  'DamageDebuff',
  'Regen',
  'Shield',
  'CrowdControl',
  'Knockback',
  'Summon',
  'Special',
  'CostChange',
  'ConcentratedTarget',
  'Accumulation',
])

export const PERSISTENT_MARKER_WIDTH = 44
const MIN_TIMED_BAR_WIDTH = 2
const ITEM_GAP = 4

export interface BuffEffectLifetime {
  auditIndex: number
  record: EffectAuditRecord
  startFrame: number
}

export interface TimedBuffBar extends BuffEffectLifetime {
  kind: 'timed'
  endFrame: number
}

export interface PersistentBuffGroup {
  kind: 'persistent'
  startFrame: number
  effects: BuffEffectLifetime[]
}

export type BuffTrackItem = TimedBuffBar | PersistentBuffGroup

export interface BuffTrackLayout {
  rows: number[]
  totalRows: number
}

const REMOVAL_ACTIONS = new Set(['expired', 'consumed', 'replaced', 'dispelled'])

/**
 * Converts engine lifecycle records into timeline items.
 * Only active effects without a natural or recorded end become persistent markers.
 */
export function buildBuffTrackItems(
  records: EffectAuditRecord[],
  targetId: number,
  maxFrame: number,
): BuffTrackItem[] {
  const removals = new Map<number, number>()
  for (const record of records) {
    if (record.effectId == null || !REMOVAL_ACTIONS.has(record.action)) continue
    const current = removals.get(record.effectId)
    if (current == null || record.frame < current) removals.set(record.effectId, record.frame)
  }

  const timed: TimedBuffBar[] = []
  const persistentByFrame = new Map<number, BuffEffectLifetime[]>()

  records.forEach((record, auditIndex) => {
    if (
      record.action !== 'applied'
      || !VISIBLE_EFFECT_TYPES.has(record.effectType)
      || !record.targetIds.includes(targetId)
    ) return

    const lifetime: BuffEffectLifetime = {
      auditIndex,
      record,
      startFrame: record.frame,
    }
    const removedAt = record.effectId == null ? undefined : removals.get(record.effectId)
    const isPersistent = record.effectId != null
      && record.expiresAt == null
      && removedAt == null

    if (isPersistent) {
      const group = persistentByFrame.get(record.frame) ?? []
      group.push(lifetime)
      persistentByFrame.set(record.frame, group)
      return
    }

    const fallbackEnd = record.effectId == null && record.expiresAt == null
      ? record.frame + 1
      : maxFrame
    const endFrame = Math.max(
      record.frame + 1,
      Math.min(record.expiresAt ?? fallbackEnd, removedAt ?? fallbackEnd),
    )
    timed.push({ ...lifetime, kind: 'timed', endFrame })
  })

  const persistent: PersistentBuffGroup[] = [...persistentByFrame.entries()].map(
    ([startFrame, effects]) => ({ kind: 'persistent', startFrame, effects }),
  )

  return [...timed, ...persistent].sort((left, right) => {
    if (left.startFrame !== right.startFrame) return left.startFrame - right.startFrame
    if (left.kind !== right.kind) return left.kind === 'persistent' ? -1 : 1
    const leftIndex = left.kind === 'persistent' ? left.effects[0]?.auditIndex ?? 0 : left.auditIndex
    const rightIndex = right.kind === 'persistent' ? right.effects[0]?.auditIndex ?? 0 : right.auditIndex
    return leftIndex - rightIndex
  })
}

/** Fixed-size markers require collision detection in pixels rather than frames. */
export function layoutBuffTrackItems(
  items: BuffTrackItem[],
  pxPerFrame: number,
): BuffTrackLayout {
  if (items.length === 0) return { rows: [], totalRows: 1 }

  const rows: number[] = []
  const rowEnds: number[] = []

  for (const item of items) {
    const left = item.startFrame * pxPerFrame
    const width = item.kind === 'persistent'
      ? PERSISTENT_MARKER_WIDTH
      : Math.max(MIN_TIMED_BAR_WIDTH, (item.endFrame - item.startFrame) * pxPerFrame)
    let row = 0
    while (row < rowEnds.length && (rowEnds[row] ?? 0) + ITEM_GAP > left) row++
    rows.push(row)
    rowEnds[row] = left + width
  }

  return { rows, totalRows: Math.max(...rows) + 1 }
}

export function effectStackCount(record: EffectAuditRecord): number {
  const match = record.detail?.match(/\bx(\d+)\s*$/)
  return match ? Number(match[1]) : 1
}
