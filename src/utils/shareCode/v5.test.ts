import { expect, it } from 'vitest'
import { decode, encode } from './v5'
import { decodeShareCode, encodeShareCode } from '../shareCode'
import { shareScenario } from '../../engine/baseline/shareScenario'

it('round-trips explicit scheduling settings through the public v5 code', () => {
  const scenario = shareScenario()
  const nsScheduling = { enabled: true, ruleVersion: 1, nsModes: scenario.lanes.map((_, index) => index === 0 ? 'automatic' as const : 'manual' as const) }
  const shared = encodeShareCode(scenario.lanes, scenario.env.bossId, scenario.env.difficulty, scenario.env.armorType, scenario.env.terrain,
    scenario.deckOrder, scenario.slots, scenario.env.maxFrame, nsScheduling)
  expect(shared.version).toBe('5.0.0')
  expect(decodeShareCode(shared.code)).toMatchObject({ version: '5.0.0', data: { nsScheduling } })
})

it('keeps the public encoder backward-compatible by explicitly writing a disabled v5 setting', () => {
  const scenario = shareScenario()
  const code = encodeShareCode(scenario.lanes).code
  expect(decodeShareCode(code)).toMatchObject({ version: '5.0.0', data: { nsScheduling: { enabled: false, ruleVersion: 1, nsModes: ['manual', 'manual', 'manual'] } } })
})

it('rejects absent, malformed and unknown scheduling versions instead of downgrading them', () => {
  const scenario = shareScenario()
  const raw = JSON.parse(encode(scenario.lanes, 0, 5, 'LightArmor', 0, undefined, scenario.slots, 5400,
    { enabled: false, ruleVersion: 1, nsModes: scenario.lanes.map(() => 'manual' as const) }))
  for (const nsScheduling of [undefined, { enabled: true, ruleVersion: 2, nsModes: raw.form.map(() => 'manual') }, { enabled: true, ruleVersion: 1, nsModes: ['manual'] }, { enabled: true, ruleVersion: 1, nsModes: raw.form.map((_: unknown, index: number) => index === 0 ? 'unknown' : 'manual') }]) {
    expect(decode(JSON.stringify({ ...raw, nsScheduling }))).toBeNull()
  }
})
