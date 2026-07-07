import { create } from 'zustand'
import type { Student } from '../types/student'
import type { SquadConfig, SquadSlot, SquadMode } from '../types/squad'
import { useTimelineStore } from './useTimelineStore'

const LS_KEY = 'abi-squad'

interface SquadSnapshot {
  mode: SquadMode
  slots: { index: number; studentId: number }[]
}

function loadSnapshot(): SquadSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SquadSnapshot
  } catch { return null }
}

function saveSnapshot(mode: SquadMode, slots: SquadSlot[]): void {
  const data: SquadSnapshot = {
    mode,
    slots: slots.filter(s => s.student).map(s => ({ index: s.index, studentId: s.student!.Id })),
  }
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

/** 生成常规战斗的卡槽配置（4前台 + 2后台） */
function createNormalSlots(): SquadSlot[] {
  const slots: SquadSlot[] = []
  for (let i = 0; i < 4; i++) {
    slots.push({ index: i, slotType: 'Main', label: `STRIKER ${i + 1}`, student: null, locked: false })
  }
  for (let i = 0; i < 2; i++) {
    slots.push({ index: 4 + i, slotType: 'Support', label: `SPECIAL ${i + 1}`, student: null, locked: false })
  }
  return slots
}

/** 生成限制解除决战的卡槽配置（6前台 + 4后台） */
function createTotalAssaultSlots(): SquadSlot[] {
  const slots: SquadSlot[] = []
  for (let i = 0; i < 6; i++) {
    slots.push({ index: i, slotType: 'Main', label: `STRIKER ${i + 1}`, student: null, locked: false })
  }
  for (let i = 0; i < 4; i++) {
    slots.push({ index: 6 + i, slotType: 'Support', label: `SPECIAL ${i + 1}`, student: null, locked: false })
  }
  return slots
}

/** 从 localStorage 恢复初始配置 */
function createInitialConfig(): SquadConfig {
  const snap = loadSnapshot()
  const mode = snap?.mode ?? 'normal'
  return {
    mode,
    slots: mode === 'normal' ? createNormalSlots() : createTotalAssaultSlots(),
  }
}

interface SquadStore {
  config: SquadConfig

  /** 初始牌序 (slotIndex 数组). null=不启用牌序验证 */
  deckOrder: number[] | null
  /** 设置牌序 */
  setDeckOrder: (order: number[]) => void
  /** 启用/禁用牌序验证 */
  toggleDeckOrder: () => void

  /** 从 localStorage 恢复编队（需在 students 加载后调用） */
  restoreFromStorage: (getStudent: (id: number) => Student | null) => void
  /** 切换队伍模式 */
  setMode: (mode: SquadMode) => void
  /** 分配学生到指定位置 */
  assignStudent: (slotIndex: number, student: Student) => void
  /** 从位置移除学生 */
  removeStudent: (slotIndex: number) => void
  /** 检查某个位置是否可用 */
  isSlotAvailable: (slotIndex: number) => boolean
  /** 获取空余的前排位置数 */
  getAvailableMainCount: () => number
  /** 获取空余的后排位置数 */
  getAvailableSupportCount: () => number
  /** 获取所有已配置的学生 */
  getAssignedStudents: () => Student[]
  /** 整体替换编队（导入分享码时使用） */
  replaceAllSlots: (slots: SquadSlot[]) => void
}

export const useSquadStore = create<SquadStore>((set, get) => ({
  config: createInitialConfig(),
  deckOrder: null,

  setDeckOrder: (order) => set({ deckOrder: order }),

  toggleDeckOrder: () => {
    const current = get().deckOrder
    if (current) {
      set({ deckOrder: null })
    } else {
      // 生成默认牌序：按 slotIndex 排序的已配置学生
      const order = get().config.slots
        .filter(s => s.student)
        .map(s => s.index)
      set({ deckOrder: order })
    }
  },

  restoreFromStorage: (getStudent) => {
    const snap = loadSnapshot()
    if (!snap) return
    const currentMode = get().config.mode
    if (snap.mode !== currentMode) {
      get().setMode(snap.mode)
    }
    for (const { index, studentId } of snap.slots) {
      const student = getStudent(studentId)
      if (student) get().assignStudent(index, student)
    }
  },

  setMode: (mode) => {
    const newSlots = mode === 'normal' ? createNormalSlots() : createTotalAssaultSlots()
    set({
      config: { mode, slots: newSlots },
    })
    // 同步重设时间轴轨道
    useTimelineStore.getState().initLanes(mode)
  },
  assignStudent: (slotIndex, student) =>
    set((state) => {
      const slot = state.config.slots[slotIndex]
      if (!slot || slot.locked) return state

      const newSlots = state.config.slots.map((s) =>
        s.index === slotIndex
          ? { ...s, student, locked: true }
          : s
      )

      // 同步分配到时间轴对应 slot
      useTimelineStore.getState().assignSlot(slotIndex, student)

      return {
        config: { ...state.config, slots: newSlots },
      }
    }),

  removeStudent: (slotIndex) =>
    set((state) => {
      const slot = state.config.slots[slotIndex]
      if (!slot || !slot.student) return state

      // 从时间轴移除（同时清空技能）
      useTimelineStore.getState().unassignSlot(slotIndex)

      const newSlots = state.config.slots.map((s) =>
        s.index === slotIndex
          ? { ...s, student: null, locked: false }
          : s
      )

      return {
        config: { ...state.config, slots: newSlots },
      }
    }),

  isSlotAvailable: (slotIndex) => {
    const slot = get().config.slots[slotIndex]
    return !slot?.locked
  },

  getAvailableMainCount: () => {
    return get().config.slots.filter((s) => s.slotType === 'Main' && !s.locked).length
  },

  getAvailableSupportCount: () => {
    return get().config.slots.filter((s) => s.slotType === 'Support' && !s.locked).length
  },

  getAssignedStudents: () => {
    return get().config.slots
      .filter((s) => s.student)
      .map((s) => s.student!)
  },

  replaceAllSlots: (slots) =>
    set((state) => ({
      config: { ...state.config, slots },
    })),
}))

// 订阅变更 → 自动持久化
useSquadStore.subscribe((state) => {
  saveSnapshot(state.config.mode, state.config.slots)
})

