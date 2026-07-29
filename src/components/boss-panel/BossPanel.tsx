import { useState, useEffect } from 'react'
import { useBossStore } from '../../stores/useBossStore'
import type { BossTerrain, BossArmorType } from '../../types/boss'
import { useI18n } from '../../i18n'

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

  return (
    <div className="ba-panel ba-cut-panel p-3">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-[10px] w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <h2 className="ba-eyebrow">{t.boss.title}</h2>
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
              onChange={(e) => selectBoss(Number(e.target.value))}
              className="w-full text-xs rounded px-2 py-1.5 border font-game"
              style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              <option value={0}>{t.boss.none}</option>
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
                  {selectedBoss.Terrain.map((terrain) => (
                    <button
                      key={terrain}
                      onClick={() => selectTerrain(terrain as BossTerrain)}
                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border font-medium transition-colors"
                      style={{
                        background: selectedTerrain === terrain ? 'var(--accent)' : 'var(--bg-surface-alt)',
                        color: selectedTerrain === terrain ? '#fff' : 'var(--text-secondary)',
                        borderColor: selectedTerrain === terrain ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}ui/Terrain_${terrain}.png`}
                        alt=""
                        className="w-4 h-4 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      {t.terrain[terrain as BossTerrain] || terrain}
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
                    <option key={d} value={d}>{t.difficulty[d] ?? `Lv${d}`}</option>
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
                      {t.armor[a]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Boss 信息摘要 */}
              <div className="text-[11px] pt-2 border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                {t.boss.default_armor}: {t.armor[selectedBoss.ArmorType] || selectedBoss.ArmorType}
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
