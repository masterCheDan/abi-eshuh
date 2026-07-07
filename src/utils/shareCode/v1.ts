/**
 * 分享码版本 1.0.0 — SDD v4.0 6段式结构
 *
 * 格式 (编码前 JSON):
 *   { ver, env, form, init?, tl, cfg? }
 *
 * 编码后 Base64:
 *   先 JSON.stringify, 再 TextEncoder → btoa
 */

import type { StudentLane } from '../../types/timeline'
import type {
  ShareCodePayload,
  CalibrationEntry,
} from '../../engine/model/types'

export const VERSION = '1.0.0'

// ═══════════════════════════════════════════════════
// 编码
// ═══════════════════════════════════════════════════

/** 编码 → JSON 字符串 */
export function encode(
  lanes: StudentLane[],
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  deckOrder?: number[],
  overrides?: CalibrationEntry[],
): string {
  const armorIdx = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor'].indexOf(armorType)

  // 1. form: slot → studentId
  const sortedSlots = lanes.map(l => l.slotIndex).sort((a, b) => a - b)
  const form: (number | null)[] = sortedSlots.map(si => {
    const lane = lanes.find(l => l.slotIndex === si)
    return lane?.student?.Id ?? null
  })

  // 2. tl: "frame casterSlot [targetSlots]"
  const events: { frame: number; casterSlot: number; targetSlots: number[] }[] = []
  for (const l of lanes) {
    for (const s of l.skills) {
      if (s.type !== 'ex') continue
      events.push({
        frame: s.startFrame,
        casterSlot: l.slotIndex,
        targetSlots: [s.targetId ?? -1],
      })
    }
  }
  events.sort((a, b) => a.frame - b.frame)
  const tl = events.map(ev => {
    // 目标 slotIndex 映射 (-1 保持)
    const targets = ev.targetSlots.map(tid =>
      tid === -1 ? -1 : findSlotByStudentId(lanes, tid),
    )
    return `${ev.frame} ${ev.casterSlot} [${targets.join(',')}]`
  })

  const payload: ShareCodePayload = {
    ver: VERSION,
    env: [bossId, difficulty, armorIdx >= 0 ? armorIdx : 2, terrain],
    form,
    tl,
  }

  if (deckOrder?.length) payload.init = deckOrder
  if (overrides?.length) payload.cfg = { override: overrides }

  return JSON.stringify(payload)
}

// ═══════════════════════════════════════════════════
// 解码
// ═══════════════════════════════════════════════════

export interface ImportDataV1 {
  studentIds: number[]
  skills: { frame: number; casterSlot: number; targetSlot: number }[]
  env: { bossId: number; difficulty: number; armorType: string; terrain: number }
  deckOrder: number[]
  overrides: CalibrationEntry[]
}

/** 解码 JSON → ImportDataV1 */
export function decode(raw: string): ImportDataV1 | null {
  try {
    const p: ShareCodePayload = JSON.parse(raw)
    if (p.ver !== VERSION) return null

    // env 解析
    const armorTypes = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor']
    const env = {
      bossId: p.env[0],
      difficulty: p.env[1],
      armorType: armorTypes[p.env[2]] ?? 'LightArmor',
      terrain: p.env[3],
    }

    // form
    const studentIds = p.form.map(v => v ?? -1)

    // tl 解析: "900 0 [0]" → { frame, casterSlot, targetSlot }
    const skills: ImportDataV1['skills'] = p.tl.map(evStr => {
      const m = evStr.match(/^(\d+)\s+(\d+)\s+\[(.+)\]$/)
      if (!m) return { frame: 0, casterSlot: 0, targetSlot: -1 }
      const targets = m[3].split(',').map(Number)
      return {
        frame: Number(m[1]),
        casterSlot: Number(m[2]),
        targetSlot: targets[0] ?? -1,
      }
    })

    return {
      studentIds,
      skills,
      env,
      deckOrder: p.init ?? [],
      overrides: p.cfg?.override ?? [],
    }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════════════

function findSlotByStudentId(lanes: StudentLane[], studentId: number): number {
  for (const l of lanes) {
    if (l.student?.Id === studentId) return l.slotIndex
  }
  return -1
}
