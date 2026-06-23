import { create } from 'zustand'
import type { Student } from '../types/student'
import type { StudentLane, SkillBlock } from '../types/timeline'

interface TimelineStore {
  /** 所有学生轨道 */
  lanes: StudentLane[]
  /** 总时长（帧），默认 3 分钟 = 5400 帧 */
  totalFrames: number

  /** 添加一个学生到时间轴 */
  addStudent: (student: Student) => void
  /** 从时间轴移除学生 */
  removeStudent: (studentId: number) => void
  /** 添加技能块 */
  addSkillBlock: (studentId: number, block: SkillBlock) => void
  /** 清空时间轴 */
  clearTimeline: () => void
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  lanes: [],
  totalFrames: 5400, // 3 分钟 @ 30fps

  addStudent: (student) =>
    set((state) => {
      // 检查是否已存在
      if (state.lanes.some((l) => l.studentId === student.Id)) {
        return state
      }
      return {
        lanes: [
          ...state.lanes,
          {
            studentId: student.Id,
            student,
            skills: [],
          },
        ],
      }
    }),

  removeStudent: (studentId) =>
    set((state) => ({
      lanes: state.lanes.filter((l) => l.studentId !== studentId),
    })),

  addSkillBlock: (studentId, block) =>
    set((state) => ({
      lanes: state.lanes.map((lane) =>
        lane.studentId === studentId
          ? { ...lane, skills: [...lane.skills, block] }
          : lane
      ),
    })),

  clearTimeline: () => set({ lanes: [] }),
}))
