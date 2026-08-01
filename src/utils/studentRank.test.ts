import { describe, expect, it } from 'vitest'
import {
  defaultStudentRank,
  normalizeStudentRank,
  withStarLevel,
  withUniqueWeaponLevel,
} from './studentRank'

describe('student rank configuration', () => {
  it('starts at the student base rarity without a unique weapon', () => {
    expect(defaultStudentRank(3)).toEqual({ starLevel: 3, uniqueWeaponLevel: 0 })
  })

  it('automatically raises the student to 5 stars when a unique weapon is selected', () => {
    expect(withUniqueWeaponLevel(1, { starLevel: 2, uniqueWeaponLevel: 0 }, 4))
      .toEqual({ starLevel: 5, uniqueWeaponLevel: 4 })
  })

  it('removes the unique weapon when the configured star level falls below 5', () => {
    expect(withStarLevel(2, { starLevel: 5, uniqueWeaponLevel: 3 }, 4))
      .toEqual({ starLevel: 4, uniqueWeaponLevel: 0 })
  })

  it('migrates malformed persisted ranks into a legal combination', () => {
    expect(normalizeStudentRank(3, 2, 9))
      .toEqual({ starLevel: 5, uniqueWeaponLevel: 4 })
  })
})
