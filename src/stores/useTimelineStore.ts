import { create } from 'zustand'
import type { Student } from '../types/student'
import type { StudentLane, SkillBlock } from '../types/timeline'
import type { SquadMode } from '../types/squad'

const LS_KEY = 'abi-timeline'

/** 可序列化的快照（student 由 SquadStore 负责，这里只存 ID 引用） */
interface TimelineSnapshot {
  mode: SquadMode
  skills: { slotIndex: number; skill: SkillBlock }[]
}

function loadSnapshot(): TimelineSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TimelineSnapshot
  } catch { return null }
}

function saveSnapshot(mode: SquadMode, lanes: StudentLane[]): void {
  const skills: TimelineSnapshot['skills'] = []
  for (const l of lanes) {
    for (const s of l.skills) {
      skills.push({ slotIndex: l.slotIndex, skill: s })
    }
  }
  localStorage.setItem(LS_KEY, JSON.stringify({ mode, skills }))
}

/** 生成固定数量的轨道（空位） */
function createEmptyLanes(mode: SquadMode): StudentLane[] {
  const lanes: StudentLane[] = []
  const mainCount = mode === 'normal' ? 4 : 6
  const supportCount = mode === 'normal' ? 2 : 4

  let index = 0
  for (let i = 0; i < mainCount; i++) {
    lanes.push({
      slotIndex: index++,
      label: `STRIKER ${i + 1}`,
      student: null,
      studentId: null,
      skills: [],
    })
  }
  for (let i = 0; i < supportCount; i++) {
    lanes.push({
      slotIndex: index++,
      label: `SPECIAL ${i + 1}`,
      student: null,
      studentId: null,
      skills: [],
    })
  }
  return lanes
}

/** 从 localStorage 恢复初始轨道 */
function createInitialLanes(): StudentLane[] {
  const snap = loadSnapshot()
  const lanes = createEmptyLanes(snap?.mode ?? 'normal')
  if (snap?.skills) {
    for (const { slotIndex, skill } of snap.skills) {
      const lane = lanes.find(l => l.slotIndex === slotIndex)
      if (lane) lane.skills.push(skill)
    }
  }
  return lanes
}

interface TimelineStore {
  /** 所有学生轨道（固定数量） */
  lanes: StudentLane[]
  /** 总时长（帧），默认 3 分钟 = 5400 帧 */
  totalFrames: number

  /** 重新初始化轨道（切换阵容模式时调用） */
  initLanes: (mode: SquadMode) => void
  /** 分配学生到指定 slot */
  assignSlot: (slotIndex: number, student: Student) => void
  /** 从 slot 移除学生 */
  unassignSlot: (slotIndex: number) => void
  /** 添加技能块 */
  addSkillBlock: (slotIndex: number, block: SkillBlock) => void
  /** 移动技能块到新位置（支持跨轨道移动） */
  moveSkillBlock: (fromSlotIndex: number, skillIndex: number, toSlotIndex: number, newStartFrame: number) => void
  /** 删除指定技能块 */
  removeSkillBlock: (slotIndex: number, skillIndex: number) => void
  /** 清空时间轴 */
  clearTimeline: () => void
  /** 整体替换 lanes（导入分享码时使用） */
  replaceAllLanes: (lanes: StudentLane[]) => void
  /** 更新指定技能块的字段（用于人工校准等单字段修改） */
  updateSkillBlock: (slotIndex: number, skillIndex: number, patch: Partial<SkillBlock>) => void
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  lanes: createInitialLanes(),
  totalFrames: 5400,

  initLanes: (mode) => set({ lanes: createEmptyLanes(mode) }),

  assignSlot: (slotIndex, student) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.slotIndex === slotIndex
          ? { ...lane, student, studentId: student.Id }
          : lane
      ),
    })),

  unassignSlot: (slotIndex) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.slotIndex === slotIndex
          ? { ...lane, student: null, studentId: null, skills: [] }
          : lane
      ),
    })),

  addSkillBlock: (slotIndex, block) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.slotIndex === slotIndex
          ? { ...lane, skills: [...lane.skills, block] }
          : lane
      ),
    })),

  moveSkillBlock: (fromSlotIndex, skillIndex, toSlotIndex, newStartFrame) =>
    set((state) => {
      const fromLane = state.lanes.find(l => l.slotIndex === fromSlotIndex)
      if (!fromLane) return state
      const block = fromLane.skills[skillIndex]
      if (!block) return state

      const moved = { ...block, startFrame: newStartFrame }
      if (fromSlotIndex === toSlotIndex) {
        // 同轨道移动：直接替换该技能的 startFrame
        return {
          lanes: state.lanes.map((lane) => {
            if (lane.slotIndex !== fromSlotIndex) return lane
            const newSkills = lane.skills.map((s, i) =>
              i === skillIndex ? moved : s
            )
            return { ...lane, skills: newSkills }
          }),
        }
      }

      // 跨轨道移动
      return {
        lanes: state.lanes.map((lane) => {
          if (lane.slotIndex === fromSlotIndex) {
            return { ...lane, skills: lane.skills.filter((_, i) => i !== skillIndex) }
          }
          if (lane.slotIndex === toSlotIndex) {
            return { ...lane, skills: [...lane.skills, moved] }
          }
          return lane
        }),
      }
    }),

  removeSkillBlock: (slotIndex, skillIndex) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.slotIndex === slotIndex
          ? { ...lane, skills: lane.skills.filter((_, i) => i !== skillIndex) }
          : lane
      ),
    })),

  clearTimeline: () => set({ lanes: createEmptyLanes('normal') }),

  replaceAllLanes: (lanes) => set({ lanes }),

  updateSkillBlock: (slotIndex, skillIndex, patch) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.slotIndex === slotIndex
          ? {
              ...lane,
              skills: lane.skills.map((s, i) =>
                i === skillIndex ? { ...s, ...patch } : s
              ),
            }
          : lane
      ),
    })),
}))

// 订阅变更 → 自动持久化
useTimelineStore.subscribe((state) => {
  // 从 lanes 推断 mode
  const mode: SquadMode = state.lanes.length > 6 ? 'total_assault' : 'normal'
  saveSnapshot(mode, state.lanes)
})

