import { expect, it } from 'vitest'
import type { EffectAuditRecord } from '../engine'
import { SimulationEngine } from '../engine/core/simulationEngine'
import { baselineBattle } from '../engine/baseline/fixtures'
import { buildBuffTrackItems, layoutBuffTrackItems } from '../components/timeline/buffTrackModel'

/** A broad ceiling catches accidental quadratic work without making CI timing-sensitive. */
it('keeps the canonical 3-minute simulation and a dense effect-track projection responsive', () => {
  const battle = baselineBattle(6)
  battle.env.maxFrame = 5400
  const coreStart = performance.now()
  const result = new SimulationEngine().simulateInput({ ...battle, intents: [] })
  const coreMs = performance.now() - coreStart
  expect(result.costHistory).toHaveLength(5401)
  expect(coreMs).toBeLessThan(2_000)

  const records: EffectAuditRecord[] = Array.from({ length: 1_200 }, (_, index) => ({
    frame: index * 4,
    issuerId: 900001 + index % 6,
    targetIds: [900001 + index % 6],
    skillRef: { kind: 'passive' },
    effectIndex: 0,
    effectType: 'Buff',
    action: 'applied',
    effectId: index,
    expiresAt: index * 4 + 300,
  }))
  const viewStart = performance.now()
  const items = buildBuffTrackItems(records, 900001, 5400)
  const layout = layoutBuffTrackItems(items, 2)
  const viewMs = performance.now() - viewStart
  expect(items.length).toBeGreaterThan(0)
  expect(layout.totalRows).toBeGreaterThan(0)
  expect(viewMs).toBeLessThan(2_000)
  console.info(`[acceptance] core=${coreMs.toFixed(1)}ms; effect-track model=${viewMs.toFixed(1)}ms; frames=5400; audit=${records.length}`)
})
