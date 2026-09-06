import { expect, it } from 'vitest'
import data from '../../data/students.min.json'
import { checkCoverage } from '../../../scripts/lib/ruleCoverage.mjs'
import { runtimeRuleBindings } from '../../engine/system/ruleBindings'
import { catalog } from './catalog'

it('every registered policy binds to an existing runtime function', () => {
  const result = checkCoverage(data, catalog, runtimeRuleBindings())
  expect(result.errors).toEqual([])
})

it('removing effect and action inspection bindings fails registration', () => {
  const bindings = runtimeRuleBindings()
  delete bindings['special.layers']
  delete bindings['action.inspect']
  delete bindings['scheduler.interval']
  const result = checkCoverage(data, catalog, bindings)
  expect(result.ok).toBe(false)
  expect(result.errors).toContainEqual(expect.objectContaining({ message: 'Missing runtime binding: special.layers' }))
  expect(result.errors).toContainEqual(expect.objectContaining({ message: 'Missing runtime binding: action.inspect' }))
  expect(result.errors).toContainEqual(expect.objectContaining({ message: 'Missing runtime binding: scheduler.interval' }))
})
