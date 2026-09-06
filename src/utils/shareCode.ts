/**
 * 分享码编/解码主入口
 *
 * 版本路由策略：
 * - 编码始终使用最新版本
 * - 解码时自动检测版本号，路由到对应 codec
 * - v1 使用 JSON 格式，v001 使用管道分隔格式
 */

import type { StudentLane } from '../types/timeline'
import type { SquadSlot } from '../types/squad'
import * as v001 from './shareCode/v001'
import * as v1 from './shareCode/v1'
import * as v2 from './shareCode/v2'
import * as v3 from './shareCode/v3'
import * as v4 from './shareCode/v4'
import * as v5 from './shareCode/v5'
import type { NsSchedulingConfig } from '../domain/rules/nsSchedulingRules'

/* ══════════════════════════════════════════════════════
   版本注册表
   ══════════════════════════════════════════════════════ */

export interface ShareCodeResult {
  version: string
  code: string
}

/** v0.0.1 导入数据结构 */
export type { ImportData, ImportEvent } from './shareCode/v001'
/** v1.0.0 导入数据结构 */
export type { ImportDataV1 } from './shareCode/v1'
export type { ImportDataV2, ImportEventV2 } from './shareCode/v2'
export type { ImportDataV3, ImportEventV3 } from './shareCode/v3'
export type { ImportDataV4, ImportEventV4 } from './shareCode/v4'
export type { ImportDataV5 } from './shareCode/v5'

interface CodecEntry {
  version: string
  encode: (...args: unknown[]) => string
  decode: (raw: string) => unknown
  /** 编码前原始字符串是否 JSON 格式 (用于解码时格式识别) */
  isJson?: boolean
}

const CODECS: Record<string, CodecEntry> = {
  [v001.VERSION]: { version: v001.VERSION, encode: v001.encode as (...args: unknown[]) => string, decode: v001.decode as (raw: string) => unknown },
  [v1.VERSION]: { version: v1.VERSION, encode: v1.encode as (...args: unknown[]) => string, decode: v1.decode as (raw: string) => unknown, isJson: true },
  [v2.VERSION]: { version: v2.VERSION, encode: v2.encode as (...args: unknown[]) => string, decode: v2.decode as (raw: string) => unknown, isJson: true },
  [v3.VERSION]: { version: v3.VERSION, encode: v3.encode as (...args: unknown[]) => string, decode: v3.decode as (raw: string) => unknown, isJson: true },
  [v4.VERSION]: { version: v4.VERSION, encode: v4.encode as (...args: unknown[]) => string, decode: v4.decode as (raw: string) => unknown, isJson: true },
  [v5.VERSION]: { version: v5.VERSION, encode: v5.encode as (...args: unknown[]) => string, decode: v5.decode as (raw: string) => unknown, isJson: true },
}

const CURRENT_VERSION = v5.VERSION

/* ══════════════════════════════════════════════════════
   公开 API
   ══════════════════════════════════════════════════════ */

/**
 * 编码 → Base64 分享码
 * @param lanes 学生轨道
 * @param bossId Boss ID (v1+)
 * @param difficulty 难度 (v1+)
 * @param armorType Boss 护甲 (v1+)
 * @param terrain 地形 (v1+)
 */
export function encodeShareCode(
  lanes: StudentLane[],
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  deckOrder?: number[],
  squadSlots?: SquadSlot[],
  maxFrame = 5400,
  nsScheduling?: NsSchedulingConfig,
): ShareCodeResult {
  const codec = CODECS[CURRENT_VERSION]
  if (!codec) throw new Error(`Unknown version: ${CURRENT_VERSION}`)

  const raw = codec.encode(lanes, bossId, difficulty, armorType, terrain, deckOrder, squadSlots, maxFrame, nsScheduling)
  const bytes = new TextEncoder().encode(raw)
  const binary = String.fromCharCode(...bytes)
  return { version: CURRENT_VERSION, code: btoa(binary) }
}

/** 解码 Base64 → 版本号 + 对应版本的 ImportData */
export function decodeShareCode(base64: string): { version: string; data: unknown } | null {
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const raw = new TextDecoder().decode(bytes)

    // 自动检测格式：JSON 开头 = v1+, 管道分隔 = v001
    let version: string

    if (raw.startsWith('{') || raw.startsWith('"')) {
      // JSON 格式 → 解析 { ver: "..." } 获取版本
      const parsed = JSON.parse(raw)
      version = parsed.ver ?? ''
    } else {
      // 管道分隔格式 → 第一段为版本号
      version = raw.split('|')[0]
    }

    const codec = CODECS[version]
    if (!codec) return null
    const data = codec.decode(raw)
    if (!data) return null
    return { version, data }
  } catch {
    return null
  }
}
