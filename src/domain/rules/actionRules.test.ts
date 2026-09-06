import { expect, it } from 'vitest'
import data from '../../data/students.min.json'
import type { StudentDB } from '../../types/student'
import { rules } from './GameRules'
import { checkCoverage } from '../../../scripts/lib/ruleCoverage.mjs'
import { inspectActionData, validateActionCatalog } from './actionData.mjs'

const students = data as unknown as StudentDB

it('keeps ammo cost separate from hit weights and never certifies a legacy guessed cycle', () => {
  const inputs = [10000, 10014, 10059].map(id => structuredClone(students[id]))
  const before = structuredClone(inputs)
  const inspections = inputs.map(student => rules.action.inspect(student))
  expect(inspections.map(r => r.variants[0])).toEqual([
    { path: '10000:N', ammoCapacity: students[10000].Ammo, ammoCost: 1 },
    { path: '10014:N', ammoCapacity: 15, ammoCost: 3 },
    { path: '10059:N', ammoCapacity: 25, ammoCost: 5 },
  ])
  for (const result of inspections) {
    expect(result.automaticEligible).toBe(false)
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    for (const code of ['UNVERIFIED_ammoDebit', 'UNVERIFIED_attackComplete', 'UNVERIFIED_reloadRefill', 'UNVERIFIED_interruptResume'])
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }))
  }
  // Multiplying damage segments must not create attacks, consume ammo or change eligibility.
  inputs[1].Skills.N.Effects![0].Hits = Array(30).fill(1000)
  expect(rules.action.inspect(inputs[1])).toEqual(inspections[1])
  expect(inputs[0]).toEqual(before[0])
  expect(rules.action.inspect(inputs[2])).toEqual(inspections[2])
})

it('reports normal replacement, fixed-rate and skill action dependencies at their source paths', () => {
  const result = rules.action.inspect(students[10136])
  expect(result.variants.map(v => v.path)).toEqual(['10136:N', '10136:N.FormChange'])
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: '10136:N.FormChange', code: 'NORMAL_REPLACEMENT' }),
    expect.objectContaining({ path: '10136:N.FormChange.FixedFrameRate', code: 'FIXED_FRAME_RATE' }),
    expect.objectContaining({ path: '10136:N.FormChange.Effects[0].StatModifier', code: 'NORMAL_STAT_MODIFIER' }),
  ]))
  const aris = rules.action.inspect(students[10066])
  expect(aris.diagnostics).toContainEqual(expect.objectContaining({
    path: '10066:EP.syntheticEffects[0].Key', code: 'SPECIAL_DEPENDENCY',
    message: rules.catalog.actions.dependencies.specials.NormalAttackOverride_MaidAris,
  }))
  const changed = structuredClone(students[10000])
  changed.Skills.E.ExtraSkills = [{ ...changed.Skills.E, Effects: [{ Type: 'Buff', Stat: 'AmmoCount_Base' }] }]
  expect(rules.action.inspect(changed).diagnostics).toContainEqual(expect.objectContaining({
    code: 'ACTION_MODIFIER', path: '10000:E.ExtraSkills[0].Effects[0].Stat',
  }))
})

it('does not fill missing legacy effects or invalid ammo/frames with plausible defaults', () => {
  const changed = structuredClone(students[10000])
  delete changed.Skills.N.Effects
  changed.Skills.N.Frames.AttackIngDuration = -1
  changed.AmmoCost = 0
  const result = rules.action.inspect(changed)
  expect(result.automaticEligible).toBe(false)
  expect(result.diagnostics.filter(d => d.severity === 'error').map(d => d.path).sort())
    .toEqual(['10000:AmmoCost', '10000:N.Effects', '10000:N.Frames.AttackIngDuration'])
  const absent = rules.action.inspect(students[20000])
  expect(absent.variants).toEqual([])
  expect(absent.diagnostics).toContainEqual(expect.objectContaining({ code: 'NO_NORMAL_DATA' }))
})

it('rejects unknown data recursively in transformed attacks and stat sources', () => {
  const changed = structuredClone(data)
  Object.assign(changed['10136'].Skills.N.FormChange, { FormChange: {
    ...structuredClone(changed['10136'].Skills.N.FormChange),
    Effects: [{ Type: 'Unknown', StatModifier: { Stat: 'Unknown', Source: 'Unknown' } }],
    UnknownTiming: 1,
  } })
  const errors = checkCoverage(changed, rules.catalog).errors
  const root = '10136:N.FormChange.FormChange'
  for (const suffix of ['.Effects[0].Type', '.Effects[0].StatModifier.Stat', '.Effects[0].StatModifier.Source', '.UnknownTiming'])
    expect(errors).toContainEqual(expect.objectContaining({ path: root + suffix }))
})

it('fails closed for unknown versions, erased limitations, bad references or claimed execution', () => {
  const config = structuredClone(rules.catalog)
  config.actions.version = 999
  config.actions.policy.status = 'implemented'
  config.actions.checkpoints.reloadRefill = ''
  config.actions.contract.attackCount = 'one_per_hit'
  Object.assign(config.actions.dependencies.stats, { UnknownStat: 'guess' })
  const errors = validateActionCatalog(config)
  for (const path of ['version', 'policy', 'checkpoints.reloadRefill', 'contract.attackCount', 'dependencies.stats.UnknownStat'])
    expect(errors).toContainEqual(expect.objectContaining({ path: 'actions.' + path }))
  expect(inspectActionData(students[10000], config).automaticEligible).toBe(false)
  expect(checkCoverage(data, config).ok).toBe(false)
  const malformed = { ...rules.catalog, actions: { ...rules.catalog.actions, requiredFrames: 0, optionalFrames: {} } }
  expect(validateActionCatalog(malformed)).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'actions.requiredFrames' }),
    expect.objectContaining({ path: 'actions.optionalFrames' }),
  ]))
})
