import { describe, expect, it } from 'vitest'
import type { EffectAuditRecord } from '../../engine/model/types'
import {
  buildBuffTrackItems,
  effectStackCount,
  layoutBuffTrackItems,
  PERSISTENT_MARKER_WIDTH,
  type BuffTrackItem,
} from './buffTrackModel'

function record(
  overrides: Partial<EffectAuditRecord> = {},
): EffectAuditRecord {
  return {
    frame: 0,
    issuerId: 1,
    targetIds: [1],
    skillRef: { kind: 'passive' },
    effectIndex: 0,
    effectType: 'Buff',
    action: 'applied',
    ...overrides,
  }
}

describe('buff track lifecycle model', () => {
  it('groups opening persistent effects into one marker', () => {
    const items = buildBuffTrackItems([
      record({ effectId: 1, stat: 'AttackPower_Coefficient' }),
      record({ effectId: 2, skillRef: { kind: 'weapon_passive' }, stat: 'MaxHP_Coefficient' }),
      record({ effectId: 3, skillRef: { kind: 'extra_passive' }, stat: 'RegenCost_Coefficient' }),
    ], 1, 5400)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'persistent', startFrame: 0 })
    expect(items[0]?.kind === 'persistent' && items[0].effects).toHaveLength(3)
  })

  it.each(['consumed', 'replaced', 'dispelled', 'expired'] as const)(
    'renders an open-ended effect as timed after it is %s',
    action => {
      const items = buildBuffTrackItems([
        record({ effectId: 7 }),
        record({ frame: 600, effectId: 7, action }),
      ], 1, 5400)

      expect(items).toEqual([
        expect.objectContaining({ kind: 'timed', startFrame: 0, endFrame: 600 }),
      ])
    },
  )

  it('keeps finite effects proportional and separates persistent groups by frame', () => {
    const items = buildBuffTrackItems([
      record({ effectId: 1 }),
      record({ frame: 300, effectId: 2 }),
      record({ frame: 60, effectId: 3, expiresAt: 960 }),
    ], 1, 5400)

    expect(items.map(item => [item.kind, item.startFrame])).toEqual([
      ['persistent', 0],
      ['timed', 60],
      ['persistent', 300],
    ])
    expect(items[1]).toMatchObject({ kind: 'timed', startFrame: 60, endFrame: 960 })
  })

  it('does not turn an instantaneous audit record into a battle-long bar', () => {
    const items = buildBuffTrackItems([
      record({ effectId: undefined, effectType: 'Regen' }),
    ], 1, 5400)

    expect(items[0]).toMatchObject({ kind: 'timed', startFrame: 0, endFrame: 1 })
  })

  it('filters effects for the requested target lane', () => {
    const items = buildBuffTrackItems([
      record({ effectId: 1, targetIds: [2] }),
      record({ effectId: 2, targetIds: [1] }),
    ], 1, 5400)

    expect(items).toHaveLength(1)
    expect(items[0]?.kind === 'persistent' && items[0].effects[0]?.record.effectId).toBe(2)
  })

  it('lays out fixed-width markers using pixel collisions at every zoom', () => {
    const items: BuffTrackItem[] = [
      { kind: 'persistent', startFrame: 0, effects: [{ auditIndex: 0, startFrame: 0, record: record({ effectId: 1 }) }] },
      { kind: 'persistent', startFrame: 50, effects: [{ auditIndex: 1, startFrame: 50, record: record({ frame: 50, effectId: 2 }) }] },
    ]

    expect(layoutBuffTrackItems(items, 1)).toEqual({ rows: [0, 0], totalRows: 1 })
    expect(layoutBuffTrackItems(items, 0.5)).toEqual({ rows: [0, 1], totalRows: 2 })
    expect(PERSISTENT_MARKER_WIDTH).toBe(44)
  })

  it('extracts explicit stack counts for tooltip details', () => {
    expect(effectStackCount(record({ detail: 'AttackPower_Coefficient x4' }))).toBe(4)
    expect(effectStackCount(record({ detail: 'AttackPower_Coefficient=1200' }))).toBe(1)
  })
})
