/**
 * 分享码编/解码主入口
 *
 * 版本路由策略：
 * - 编码始终使用最新版本
 * - 解码时读取版本号，自动路由到对应 codec
 * - 每个版本独立一个文件 (shareCode/vXXX.ts)
 */

import type { StudentLane } from '../types/timeline'
import * as v001 from './shareCode/v001'

/* ══════════════════════════════════════════════════════
   版本注册表
   ══════════════════════════════════════════════════════ */

export interface ShareCodeResult {
  version: string
  code: string
}

/** v0.0.1 导入数据结构 */
export type { ImportData, ImportEvent } from './shareCode/v001'

const CODECS: Record<string, { encode(lanes: StudentLane[]): string; decode(raw: string): any }> = {
  [v001.VERSION]: v001,
}

const CURRENT_VERSION = v001.VERSION

/* ══════════════════════════════════════════════════════
   公开 API
   ══════════════════════════════════════════════════════ */

/** 编码 → Base64 分享码 */
export function encodeShareCode(lanes: StudentLane[]): ShareCodeResult {
  const codec = CODECS[CURRENT_VERSION]
  if (!codec) throw new Error(`Unknown version: ${CURRENT_VERSION}`)

  const raw = codec.encode(lanes)
  const bytes = new TextEncoder().encode(raw)
  const binary = String.fromCharCode(...bytes)
  return { version: CURRENT_VERSION, code: btoa(binary) }
}

/** 解码 Base64 → 版本号 + 对应版本的 ImportData */
export function decodeShareCode(base64: string): { version: string; data: any } | null {
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const raw = new TextDecoder().decode(bytes)
    const version = raw.split('|')[0]
    const codec = CODECS[version]
    if (!codec) return null
    const data = codec.decode(raw)
    if (!data) return null
    return { version, data }
  } catch {
    return null
  }
}
