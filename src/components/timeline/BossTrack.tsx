/**
 * Boss 轨道 (T2) — SDD v6.1
 *
 * 标识 Boss 战斗全程区间：
 * - 未选 Boss → 隐藏
 * - 已选 Boss → 显示总时长色条 + Boss 名称/护甲
 * - Phase 2 将添加 Boss 技能前摇/判定区间色块
 */

import { useMemo } from 'react'

interface BossTrackProps {
  totalWidth: number
  totalFrames: number
  /** Boss 名称 (无则隐藏轨道) */
  bossName?: string
  /** Boss 护甲类型 */
  armorType?: string
}

const TRACK_HEIGHT = 24

const ARMOR_COLORS: Record<string, string> = {
  LightArmor: 'rgba(239,68,68,0.08)',
  HeavyArmor: 'rgba(234,179,8,0.08)',
  Unarmed: 'rgba(59,130,246,0.08)',
  ElasticArmor: 'rgba(168,85,247,0.08)',
  CompositeArmor: 'rgba(34,197,94,0.08)',
}

const ARMOR_LABELS: Record<string, string> = {
  LightArmor: '轻装甲',
  HeavyArmor: '重装甲',
  Unarmed: '特殊装甲',
  ElasticArmor: '弹力装甲',
  CompositeArmor: '复合装甲',
}

export function BossTrack({
  totalWidth,
  totalFrames,
  bossName,
  armorType,
}: BossTrackProps) {
  const durationSec = useMemo(() => totalFrames / 30, [totalFrames])

  if (!bossName) {
    return null
  }

  const bgColor = armorType ? (ARMOR_COLORS[armorType] ?? 'rgba(107,114,128,0.06)') : 'rgba(107,114,128,0.06)'
  const armorLabel = armorType ? (ARMOR_LABELS[armorType] ?? armorType) : ''

  return (
    <div className="flex border-b" style={{ height: TRACK_HEIGHT, borderColor: 'var(--border)' }}>
      {/* 左侧标签 */}
      <div
        className="sticky left-0 z-10 shrink-0 w-36 border-r flex items-center px-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <span className="text-[10px] font-game tracking-wider" style={{ color: 'var(--text-muted)' }}>
          BOSS
        </span>
      </div>

      {/* 轨道区域 */}
      <div className="relative flex-1" style={{ width: totalWidth }}>
        {/* 全场色条 */}
        <div
          className="absolute top-0 h-full flex items-center justify-between px-3 select-none"
          style={{
            left: 0,
            width: totalWidth,
            background: bgColor,
          }}
        >
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {bossName}
          </span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {armorLabel} · {Math.floor(durationSec / 60)}:{String(Math.floor(durationSec % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  )
}
