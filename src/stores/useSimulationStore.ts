/**
 * SimulationStore — 订阅 TimelineStore + SquadStore + BossStore 变更，
 * 自动调用 Engine.simulate() 产出 SimulationResult。
 *
 * SDD §2: UI 交互 → Intent List → Engine.simulate() → SimulationResult → React
 */

import { create } from 'zustand'
import type { SimulationResult, SimulationError } from '../engine'
import { runSimulation } from '../engine'
import { useTimelineStore } from './useTimelineStore'
import { useStudentStore } from './useStudentStore'
import { useSquadStore } from './useSquadStore'
import { useBossStore } from './useBossStore'
import { currentPlanSnapshot } from './currentPlan'
import { scheduleSimulation } from './simulationTransaction'
import { alignNsScheduling, useNsSchedulingStore } from './useNsSchedulingStore'

const TERRAIN_INDEX: Record<string, number> = { Street: 0, Outdoor: 1, Indoor: 2 }

interface SimulationStore {
  /** 最近一次推演结果 */
  result: SimulationResult | null
  /** 是否正在计算 */
  computing: boolean
  /** 手动触发推演 */
  tick: () => void
}

export const useSimulationStore = create<SimulationStore>((set) => {
  // 防抖定时器
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const doSimulate = () => {
    const lanes = useTimelineStore.getState().lanes
    const studentDb = useStudentStore.getState().students
    const squadState = useSquadStore.getState()
    const deckOrder = squadState.deckOrder
    const slotLevels = squadState.config.slots
    // 读取 Boss 配置
    const bossState = useBossStore.getState()
    if (!studentDb) {
      set({ result: null, computing: false })
      return
    }

    // 构建 students Map
    const students = new Map(
      Object.entries(studentDb).map(([k, v]) => [parseInt(k), v]),
    )

    const result = runSimulation({
      maxFrame: currentPlanSnapshot().env.maxFrame,
      lanes,
      students,
      slotLevels,
      deckOrder,
      bossId: bossState.selectedBossId || undefined,
      difficulty: bossState.selectedDifficulty,
      armorType: bossState.selectedArmorType,
      terrain: TERRAIN_INDEX[bossState.selectedTerrain] ?? 0,
      nsScheduling: alignNsScheduling(useNsSchedulingStore.getState().config, lanes.map(lane => lane.student?.Id ?? null)),
    })
    set({ result, computing: false })
  }

  // 订阅 TimelineStore + SquadStore + BossStore 变更 → 自动推演（防抖 200ms）
  useTimelineStore.subscribe(() => {
    scheduleSimulation(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      set({ computing: true })
      debounceTimer = setTimeout(doSimulate, 200)
    })
  })
  useSquadStore.subscribe(() => {
    scheduleSimulation(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      set({ computing: true })
      debounceTimer = setTimeout(doSimulate, 200)
    })
  })
  useBossStore.subscribe(() => {
    scheduleSimulation(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      set({ computing: true })
      debounceTimer = setTimeout(doSimulate, 200)
    })
  })
  useNsSchedulingStore.subscribe(() => {
    scheduleSimulation(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      set({ computing: true })
      debounceTimer = setTimeout(doSimulate, 200)
    })
  })

  return {
    result: null,
    computing: false,
    tick: doSimulate,
  }
})

/** 从 SimulationResult 提取错误/警告摘要 */
export function getSimulationSummary(result: SimulationResult | null): {
  errors: SimulationError[]
  costWarnings: SimulationError[]
  windowWarnings: SimulationError[]
  total: number
  window: SimulationResult['window']
} | null {
  if (!result) return null

  const errors = result.errors
  const costWarnings = errors.filter((e) => e.type === 'COST_EXCEEDED')
  const windowWarnings = errors.filter((e) => e.type === 'OUT_OF_WINDOW')

  return {
    errors,
    costWarnings,
    windowWarnings,
    total: errors.length,
    window: result.window,
  }
}
