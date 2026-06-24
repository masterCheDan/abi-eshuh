import { create } from 'zustand'
import type { Student, SquadType } from '../types/student'
import type { SquadConfig, SquadSlot, SquadMode } from '../types/squad'
import { useTimelineStore } from './useTimelineStore'

/** 生成常规战斗的卡槽配置（4前台 + 2后台） */
function createNormalSlots(): SquadSlot[] {
  const slots: SquadSlot[] = []
  for (let i = 0; i < 4; i++) {
    slots.push({ index: i, slotType: 'Main', label: `前排 ${i + 1}`, student: null, locked: false })
  }
  for (let i = 0; i < 2; i++) {
    slots.push({ index: 4 + i, slotType: 'Support', label: `后排 ${i + 1}`, student: null, locked: false })
  }
  return slots
}

/** 生成限制解除决战的卡槽配置（6前台 + 4后台） */
function createTotalAssaultSlots(): SquadSlot[] {
  const slots: SquadSlot[] = []
  for (let i = 0; i < 6; i++) {
    slots.push({ index: i, slotType: 'Main', label: `前排 ${i + 1}`, student: null, locked: false })
  }
  for (let i = 0; i < 4; i++) {
    slots.push({ index: 6 + i, slotType: 'Support', label: `后排 ${i + 1}`, student: null, locked: false })
  }
  return slots
}

interface SquadStore {
  config: SquadConfig

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
}

export const useSquadStore = create<SquadStore>((set, get) => ({
  config: {
    mode: 'normal',
    slots: createNormalSlots(),
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
}))

