export const MAX_STAR_LEVEL = 5
export const MAX_UNIQUE_WEAPON_LEVEL = 4

export interface StudentRank {
  starLevel: number
  uniqueWeaponLevel: number
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function defaultStudentRank(baseStarGrade: number): StudentRank {
  return {
    starLevel: clampInteger(baseStarGrade, 1, MAX_STAR_LEVEL, 1),
    uniqueWeaponLevel: 0,
  }
}

/** 恢复旧存档或导入配置时，将星级与专武等级收敛到合法组合。 */
export function normalizeStudentRank(
  baseStarGrade: number,
  starLevel?: number,
  uniqueWeaponLevel?: number,
): StudentRank {
  const base = defaultStudentRank(baseStarGrade)
  const weapon = clampInteger(uniqueWeaponLevel, 0, MAX_UNIQUE_WEAPON_LEVEL, 0)
  const star = clampInteger(starLevel, base.starLevel, MAX_STAR_LEVEL, base.starLevel)
  return {
    starLevel: weapon > 0 ? MAX_STAR_LEVEL : star,
    uniqueWeaponLevel: weapon,
  }
}

/** 主动降低至 5★以下时，专武会被一并卸下。 */
export function withStarLevel(
  baseStarGrade: number,
  current: StudentRank,
  requestedStarLevel: number,
): StudentRank {
  const base = defaultStudentRank(baseStarGrade)
  const starLevel = clampInteger(requestedStarLevel, base.starLevel, MAX_STAR_LEVEL, current.starLevel)
  return {
    starLevel,
    uniqueWeaponLevel: starLevel < MAX_STAR_LEVEL ? 0 : current.uniqueWeaponLevel,
  }
}

/** 任意专武等级均以 5★为前置；选择专武时自动补齐星级。 */
export function withUniqueWeaponLevel(
  baseStarGrade: number,
  current: StudentRank,
  requestedWeaponLevel: number,
): StudentRank {
  const uniqueWeaponLevel = clampInteger(
    requestedWeaponLevel,
    0,
    MAX_UNIQUE_WEAPON_LEVEL,
    current.uniqueWeaponLevel,
  )
  return {
    starLevel: uniqueWeaponLevel > 0
      ? MAX_STAR_LEVEL
      : clampInteger(current.starLevel, defaultStudentRank(baseStarGrade).starLevel, MAX_STAR_LEVEL, MAX_STAR_LEVEL),
    uniqueWeaponLevel,
  }
}
