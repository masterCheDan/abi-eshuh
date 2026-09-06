/** 分享码 v5：在 v4 可复现事实的基础上，保存显式自动 NS 调度配置。 */
import type { NsSchedulingConfig } from '../../domain/rules/nsSchedulingRules'
import { validateNsSchedulingConfig } from '../../domain/rules/nsSchedulingRules'
import { catalog } from '../../domain/rules/catalog'
import type { StudentLane } from '../../types/timeline'
import type { SquadSlot } from '../../types/squad'
import * as v4 from './v4'

export const VERSION = '5.0.0' as const

export interface ImportDataV5 extends v4.ImportDataV4 {
  nsScheduling: NsSchedulingConfig
}

function validate(config: unknown, form: unknown): config is NsSchedulingConfig {
  if (!Array.isArray(form) || !config || typeof config !== 'object') return false
  try {
    validateNsSchedulingConfig(config as NsSchedulingConfig, form.map(value => value === null ? null : Number(value)))
    return true
  } catch { return false }
}

export function encode(
  lanes: StudentLane[],
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  deckOrder?: number[],
  squadSlots?: SquadSlot[],
  maxFrame = 5400,
  nsScheduling?: NsSchedulingConfig,
): string {
  const raw = JSON.parse(v4.encode(lanes, bossId, difficulty, armorType, terrain, deckOrder, squadSlots, maxFrame)) as Record<string, unknown>
  const form = raw.form
  const config = nsScheduling ?? { enabled: false, ruleVersion: catalog.nsScheduling.version, nsModes: Array.isArray(form) ? form.map(() => 'manual' as const) : [] }
  if (!validate(config, form)) throw new Error('自动 NS 调度版本或逐槽位模式非法')
  return JSON.stringify({ ...raw, ver: VERSION, nsScheduling: config })
}

export function decode(raw: string): ImportDataV5 | null {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>
    if (payload.ver !== VERSION || !validate(payload.nsScheduling, payload.form)) return null
    const base = v4.decode(JSON.stringify({ ...payload, ver: v4.VERSION }))
    return base ? { ...base, nsScheduling: structuredClone(payload.nsScheduling as NsSchedulingConfig) } : null
  } catch { return null }
}
