/**
 * Boss 选择器 — SDD §6.1 预配置
 *
 * 放置在 Timeline 标题栏，允许用户：
 * - 选择目标 Boss（binah / kaiten / ...）
 * - 选择难度等级 (Normal ~ Torment)
 *
 * 选择后自动更新 BattleEnv (Engine Bridge)
 */

import { useEffect } from 'react'
import { useBossStore } from '../../stores/useBossStore'

const DIFFICULTY_LABELS: Record<number, string> = {
    0: 'Normal', 1: 'Hard', 2: 'VeryHard',
    3: 'Hardcore', 4: 'Extreme', 5: 'Insane',
    6: 'Torment', 7: 'Lunatic',
}

export function BossSelector() {
    const { bosses, selectedBossId, selectedDifficulty, loadBosses, selectBoss, selectDifficulty } = useBossStore()

    useEffect(() => { loadBosses() }, [loadBosses])

    const bossList = bosses ? Object.values(bosses).sort((a, b) => a.Id - b.Id) : []

    const selectedBoss = selectedBossId > 0 ? bossList.find(b => b.Id === selectedBossId) : null

    const maxDiff = selectedBoss
        ? selectedBoss.MaxDifficulty.slice(0, 3).reduce((a, b) => Math.max(a, b), 6)
        : 7

    return (
        <div className="flex items-center gap-1.5">
            {/* Boss 下拉 */}
            <select
                value={selectedBossId}
                onChange={(e) => selectBoss(Number(e.target.value))}
                className="text-[10px] rounded px-1.5 py-0.5 border font-game"
                style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
                <option value={0}>无 Boss</option>
                {bossList.map(b => (
                    <option key={b.Id} value={b.Id}>{b.Name}</option>
                ))}
            </select>

            {/* 难度下拉 */}
            {selectedBossId > 0 && (
                <select
                    value={selectedDifficulty}
                    onChange={(e) => selectDifficulty(Number(e.target.value))}
                    className="text-[10px] rounded px-1 py-0.5 border font-game"
                    style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                >
                    {Array.from({ length: maxDiff + 1 }, (_, d) => (
                        <option key={d} value={d}>{DIFFICULTY_LABELS[d] ?? `Lv${d}`}</option>
                    ))}
                </select>
            )}

            {/* Boss 信息简略 */}
            {selectedBoss && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                    {selectedBoss.ArmorType} · {Math.floor((selectedBoss.BattleDuration[selectedDifficulty] ?? 180) / 60)}:{String((selectedBoss.BattleDuration[selectedDifficulty] ?? 180) % 60).padStart(2, '0')}
                </span>
            )}
        </div>
    )
}
