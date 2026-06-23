import { create } from 'zustand'
import type { Student, StudentDB } from '../types/student'

interface StudentState {
  /** 全部学生数据（以 ID 为 key） */
  students: StudentDB | null
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null

  /** 加载学生数据 */
  loadStudents: () => Promise<void>
  /** 按条件搜索学生 */
  searchStudents: (query: string) => Student[]
  /** 按学校过滤 */
  getBySchool: (school: string) => Student[]
  /** 获取单个学生 */
  getStudent: (id: number) => Student | null
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: null,
  loading: false,
  error: null,

  loadStudents: async () => {
    // 避免重复加载
    if (get().students) return

    set({ loading: true, error: null })

    try {
      const response = await fetch('/data/students.min.json')
      if (!response.ok) {
        throw new Error(`加载失败: ${response.status}`)
      }
      const data: StudentDB = await response.json()
      set({ students: data, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载学生数据失败',
        loading: false,
      })
    }
  },

  searchStudents: (query: string) => {
    const { students } = get()
    if (!students) return []

    const q = query.toLowerCase().trim()
    if (!q) return Object.values(students)

    return Object.values(students).filter(
      (s) =>
        s.Name.toLowerCase().includes(q) ||
        s.School.toLowerCase().includes(q)
    )
  },

  getBySchool: (school: string) => {
    const { students } = get()
    if (!students) return []
    return Object.values(students).filter((s) => s.School === school)
  },

  getStudent: (id: number) => {
    const { students } = get()
    if (!students) return null
    return students[String(id)] ?? null
  },
}))
