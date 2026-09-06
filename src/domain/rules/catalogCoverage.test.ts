import { describe, expect, it } from 'vitest'
import data from '../../data/students.min.json'
import { checkCoverage, formatCoverage } from '../../../scripts/lib/ruleCoverage.mjs'
import { catalog, registeredManualReasons } from './catalog'
import type { SkillEffect } from '../../types/student'

const database = () => structuredClone(data) as unknown as Record<string, { Id: number; Skills: Record<string, { Effects: SkillEffect[]; ExtraSkills?: unknown[] }> }>

describe('versioned coverage gate', () => {
  it('B01: checks all generated keys and reports real data deterministically without mutation', () => {
    const before = structuredClone({ data, catalog })
    const result = checkCoverage(data, catalog)
    expect(result.errors).toEqual([])
    expect(result).toEqual(checkCoverage(data, catalog))
    expect({ data, catalog }).toEqual(before)
    expect(formatCoverage(result)).toContain('规则登记检查通过（不代表全部机制完整实现）')
    for (const status of ['implemented', 'manual_fact', 'state_only', 'partial']) expect(result.counts[status]).toBeGreaterThan(0)
    expect(result.actions.eligible).toBe(0)
    expect(result.actions.students).toHaveLength(Object.keys(data).length)
    expect(result.entries).toContainEqual(expect.objectContaining({ path: '10136:N.FormChange.actionData', status: 'state_only' }))
  })

  it.each([
    [{ Type: 'Unknown' }, '.Type'],
    [{ Type: 'Buff', Target: 'Unknown' }, '.Target[0]'],
    [{ Type: 'Buff', Stat: 'Unknown' }, '.Stat'],
    [{ Type: 'Special', Key: 'Unknown' }, '.Key'],
    [{ Type: 'CostChange', ValueType: 'Unknown' }, '.ValueType'],
    [{ Type: 'Buff', Condition: { Type: 'Unknown' } }, '.Condition.Type'],
    [{ Type: 'Buff', Condition: { Type: 'TargetProp', Parameter: 'Unknown', Operand: 'Equal' } }, '.Condition.Parameter'],
    [{ Type: 'Buff', Condition: { Type: 'TargetProp', Parameter: 'Size', Operand: 'Unknown' } }, '.Condition.Operand'],
  ] as const)('rejects unregistered fields with their exact source path: %j', (effect, suffix) => {
    const changed = database()
    changed['10000'].Skills.E.Effects = [effect]
    changed['10000'].Skills.N.Effects = [effect]
    const result = checkCoverage(changed, catalog)
    expect(result.ok).toBe(false)
    for (const kind of ['E', 'N'])
      expect(result.errors).toContainEqual(expect.objectContaining({ path: `10000:${kind}.Effects[0]${suffix}` }))
  })

  it('recurses beyond the first extra skill level, even with an explicit trigger registration', () => {
    const changed = database()
    changed['10000'].Skills.E.ExtraSkills = [{ Effects: [], ExtraSkills: [{ Effects: [], ExtraSkills: [{ Effects: [{ Type: 'Unknown' }] }] }] }]
    const config = structuredClone(catalog)
    Object.assign(config.skills['10000'], {
      'E.ExtraSkills[0]': ['manual.extra_ex'],
      'E.ExtraSkills[0].ExtraSkills[0]': ['manual.extra_ex'],
      'E.ExtraSkills[0].ExtraSkills[0].ExtraSkills[0]': ['manual.extra_ex'],
    })
    const result = checkCoverage(changed, config)
    expect(result.errors).toContainEqual(expect.objectContaining({ path: '10000:E.ExtraSkills[0].ExtraSkills[0].ExtraSkills[0].Effects[0].Type' }))
  })

  it('checks opening synthetic effects and generated layer targets', () => {
    const config = structuredClone(catalog)
    config.opening.public['10015'].syntheticEffects[0].Key = 'MissingSynthetic'
    config.band.grants[0].targetKey = 'MissingGrant'
    const result = checkCoverage(data, config)
    expect(result.errors).toContainEqual(expect.objectContaining({ path: '10015:G.syntheticEffects[0].Key' }))
    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'band.grants[0].targetKey' }))
  })

  it('rejects a named new skill instead of granting an automatic manual fallback', () => {
    const changed = database()
    changed['999999'] = { ...structuredClone(changed['10000']), Id: 999999 }
    const result = checkCoverage(changed, catalog)
    expect(result.errors).toContainEqual(expect.objectContaining({ path: '999999:P', message: 'Missing explicit skill trigger registration' }))
    expect(registeredManualReasons(999999, 'P')).toBeUndefined()
  })

  it('rejects a removed trigger, invalid effect index and orphan student reference', () => {
    const config = structuredClone(catalog)
    config.skills['10000'].P = []
    config.opening.overrides['10105'].effectIndices = [999]
    config.band.grants[0].issuerId = 999999
    const result = checkCoverage(data, config)
    for (const path of ['10000:P', 'opening.ep.10105.effectIndices', 'band.grants[0]']) expect(result.errors).toContainEqual(expect.objectContaining({ path }))
  })

  it('rejects incompatible trigger registration and non-positive schedule configuration', () => {
    const config = structuredClone(catalog)
    config.skills['10000'].E = ['manual.public']
    config.ns['10000'].seconds = 0
    config.band.decays[0].everyMs = 0
    config.band.grants[0].perLayers = 0
    const result = checkCoverage(data, config)
    for (const path of ['10000:E', 'ns.10000', 'band.decays[0]', 'band.grants[0]']) expect(result.errors).toContainEqual(expect.objectContaining({ path }))
  })

  it('rejects missing strategy, duplicate IDs, and invalid trigger modes', () => {
    const config = structuredClone(catalog)
    config.policies.effects.Buff.strategy = ''
    config.policies.effects.Damage.id = config.policies.effects.Buff.id
    config.triggers['opening.passive'].mode = 'unregistered'
    const result = checkCoverage(data, config)
    for (const path of ['policies.effects.Buff', 'policies.effects.Damage', 'triggers.opening.passive']) expect(result.errors).toContainEqual(expect.objectContaining({ path }))
  })

  it.each(['partial', 'state_only'] as const)('only accepts %s with an explicit limitation and policy', status => {
    const config = structuredClone(catalog)
    Object.assign(config.policies.specials.Fury, { status, strategy: 'Record the existing state only', limitations: 'No downstream combat simulation' })
    const accepted = checkCoverage(data, config)
    expect(accepted.ok).toBe(true)
    expect(accepted.entries).toContainEqual(expect.objectContaining({ ruleId: 'special.Fury', status, limitations: 'No downstream combat simulation' }))
    config.policies.specials.Fury.limitations = ''
    expect(checkCoverage(data, config).errors).toContainEqual(expect.objectContaining({ path: 'policies.specials.Fury' }))
  })

  it('rejects missing named dispel rules and inconsistent generated band data', () => {
    const config = structuredClone(catalog)
    config.band.exGrants['10091'][0][4] = 100
    const changed = database()
    changed['10000'].Skills.E.Effects = [{ Type: 'Dispel' }]
    const result = checkCoverage(changed, { ...config, dispel: {} })
    expect(result.errors).toContainEqual(expect.objectContaining({ path: '10000:E.Effects[0]', message: 'No named Dispel policy' }))
    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'band.exGrants.10091', message: 'Generated EX layers differ from shared configuration' }))
  })
})
