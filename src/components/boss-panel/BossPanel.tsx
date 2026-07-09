import { useState, useEffect } from 'react'
import { useBossStore } from '../../stores/useBossStore'
import type { BossTerrain, BossArmorType } from '../../types/boss'
import { useI18n } from '../../i18n'

const TERRAIN_LABELS: Record<BossTerrain, string> = {
  Street: '街道战',
  Outdoor: '户外战',
  Indoor: '室内战',
}

const DIFFICULTY_LABELS: Record<number, string> = {
  0: 'Normal', 1: 'Hard', 2: 'VeryHard',
  3: 'Hardcore', 4: 'Extreme', 5: 'Insane',
  6: 'Torment', 7: 'Lunatic',
}

const ARMOR_LABELS: Record<BossArmorType, string> = {
  LightArmor: '轻装甲',
  HeavyArmor: '重装甲',
  Unarmed: '特殊装甲',
  ElasticArmor: '弹力装甲',
  CompositeArmor: '复合装甲',
}

const ALL_ARMOR_TYPES: BossArmorType[] = [
  'LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor',
]

const ARMOR_COLORS: Record<BossArmorType, string> = {
  LightArmor: '#ef4444',
  HeavyArmor: '#eab308',
  Unarmed: '#4f90ff',
  ElasticArmor: '#c97eff',
  CompositeArmor: '#22c55e',
}

export function BossPanel() {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const {
    bosses, selectedBossId, selectedDifficulty,
    selectedTerrain, selectedArmorType,
    loadBosses, selectBoss, selectDifficulty,
    selectTerrain, selectArmorType,
  } = useBossStore()

  useEffect(() => { loadBosses() }, [loadBosses])

  const bossList = bosses ? Object.values(bosses).sort((a, b) => a.Id - b.Id) : []
  const selectedBoss = selectedBossId > 0 ? bossList.find(b => b.Id === selectedBossId) : null
  const maxDiff = selectedBoss
    ? selectedBoss.MaxDifficulty.slice(0, 3).reduce((a, b) => Math.max(a, b), 6)
    : 7

  // 切换 Boss 时自动选第一个可用地形
  const handleBossChange = (id: number) => {
    selectBoss(id)
  }

  return (
    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <h2 className="text-sm font-semibold text-gray-200">{t.boss.title}</h2>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {/* Boss 选择 */}
          <div>
            <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
              {t.boss.boss_label}
            </label>
            <select
              value={selectedBossId}
              onChange={(e) => handleBossChange(Number(e.target.value))}
              className="w-full text-xs rounded px-2 py-1.5 border font-game"
              style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              <option value={0}>无 Boss</option>
              {bossList.map(b => (
                <option key={b.Id} value={b.Id}>{b.Name}</option>
              ))}
            </select>
          </div>

          {selectedBoss && (
            <>
              {/* 地形选择 */}
              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t.boss.terrain}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedBoss.Terrain.map((t) => (
                    <button
                      key={t}
                      onClick={() => selectTerrain(t as BossTerrain)}
                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border font-medium transition-colors"
                      style={{
                        background: selectedTerrain === t ? 'var(--accent)' : 'var(--bg-surface-alt)',
                        color: selectedTerrain === t ? '#fff' : 'var(--text-secondary)',
                        borderColor: selectedTerrain === t ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}ui/Terrain_${t}.png`}
                        alt=""
                        className="w-4 h-4 object-contain"
                      />
                      {TERRAIN_LABELS[t as BossTerrain] || t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 难度选择 */}
              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t.boss.difficulty}
                </label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => selectDifficulty(Number(e.target.value))}
                  className="w-full text-xs rounded px-2 py-1.5 border font-game"
                  style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                >
                  {Array.from({ length: maxDiff + 1 }, (_, d) => (
                    <option key={d} value={d}>{DIFFICULTY_LABELS[d] ?? `Lv${d}`}</option>
                  ))}
                </select>
              </div>

              {/* 装甲选择（大决战可自选） */}
              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t.boss.armor}
                  <span className="ml-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {t.boss.grand_assault_hint}
                  </span>
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {ALL_ARMOR_TYPES.map((a) => (
                    <button
                      key={a}
                      onClick={() => selectArmorType(a)}
                      className="text-[11px] px-2.5 py-1 rounded border font-medium transition-colors"
                      style={{
                        background: selectedArmorType === a ? ARMOR_COLORS[a] : `${ARMOR_COLORS[a]}18`,
                        color: selectedArmorType === a ? '#fff' : ARMOR_COLORS[a],
                        borderColor: selectedArmorType === a ? ARMOR_COLORS[a] : `${ARMOR_COLORS[a]}40`,
                      }}
                    >
                      {ARMOR_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Boss 信息摘要 */}
              <div className="text-[11px] pt-2 border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                {t.boss.default_armor}: {ARMOR_LABELS[selectedBoss.ArmorType] || selectedBoss.ArmorType}
                {' · '}
                {t.boss.duration}: {Math.floor((selectedBoss.BattleDuration[selectedDifficulty] ?? 180) / 60)}:{String((selectedBoss.BattleDuration[selectedDifficulty] ?? 180) % 60).padStart(2, '0')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
