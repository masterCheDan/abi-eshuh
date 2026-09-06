import { expect, it } from 'vitest'
import { alignNsScheduling, defaultNsScheduling } from './useNsSchedulingStore'

it('keeps modes slot-aligned and never retains automatic scheduling for an empty slot', () => {
  const config = { enabled: true, ruleVersion: 1, nsModes: ['automatic', 'automatic', 'manual'] as Array<'manual' | 'automatic'> }
  expect(alignNsScheduling(config, [10012, null, 10028, null])).toEqual({ enabled: true, ruleVersion: 1, nsModes: ['automatic', 'manual', 'manual', 'manual'] })
  expect(defaultNsScheduling(3)).toEqual({ enabled: false, ruleVersion: 1, nsModes: ['manual', 'manual', 'manual'] })
})
