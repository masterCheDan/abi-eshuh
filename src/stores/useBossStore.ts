/**
 * Boss 数据 Store
 *
 * 从 public/data/bosses.min.json 加载 14 名总力战 Boss 元数据。
 * 用户选择 Boss + 难度 + 地形 + 装甲后，通过 Engine Bridge 影响 BattleEnv。
 */

import { create } from 'zustand'
import type { BossData, BossTerrain, BossArmorType } from '../types/boss'

/** 按 Boss.Id 查找（不依赖 JSON key 与 Id 一致） */
function getBossById(bosses: Record<string, BossData> | null, id: number): BossData | null {
    if (!bosses) return null
    return Object.values(bosses).find(b => b.Id === id) ?? null
}

interface BossState {
    /** 全部 Boss 数据（以 ID 为 key） */
    bosses: Record<string, BossData> | null
    /** 当前选中的 Boss ID (0=无, 1-14=具体Boss) */
    selectedBossId: number
    /** 当前选中的难度 (0-7) */
    selectedDifficulty: number
    /** 当前选中的地形 */
    selectedTerrain: BossTerrain
    /** 当前选中的 Boss 装甲类型（大决战可自选） */
    selectedArmorType: BossArmorType
    /** 加载状态 */
    loading: boolean

    /** 加载 Boss 数据 */
    loadBosses: () => Promise<void>
    /** 选择 Boss */
    selectBoss: (id: number) => void
    /** 选择难度 */
    selectDifficulty: (d: number) => void
    /** 选择地形 */
    selectTerrain: (t: BossTerrain) => void
    /** 选择装甲类型 */
    selectArmorType: (a: BossArmorType) => void
    /** 获取当前选中的 Boss */
    getSelectedBoss: () => BossData | null
}

export const useBossStore = create<BossState>((set, get) => ({
    bosses: null,
    selectedBossId: 0,
    selectedDifficulty: 4, // 默认 Extreme
    selectedTerrain: 'Street',
    selectedArmorType: 'HeavyArmor',
    loading: false,

    loadBosses: async () => {
        if (get().bosses) return
        set({ loading: true })
        try {
            const res = await fetch(`${import.meta.env.BASE_URL}data/bosses.min.json`)
            if (!res.ok) throw new Error(`加载失败: ${res.status}`)
            const data: Record<string, BossData> = await res.json()
            set({ bosses: data, loading: false })
        } catch {
            set({ loading: false })
        }
    },

    selectBoss: (id) => {
        // 切换 Boss 时自动更新地形和装甲为 Boss 的默认值
        const boss = getBossById(get().bosses, id)
        set({
            selectedBossId: id,
            selectedTerrain: boss?.Terrain[0] ?? 'Street',
            selectedArmorType: boss?.ArmorType ?? 'HeavyArmor',
        })
    },

    selectDifficulty: (d) => set({ selectedDifficulty: d }),

    selectTerrain: (t) => set({ selectedTerrain: t }),

    selectArmorType: (a) => set({ selectedArmorType: a }),

    getSelectedBoss: () => {
        const { bosses, selectedBossId } = get()
        if (selectedBossId === 0) return null
        return getBossById(bosses, selectedBossId)
    },
}))
