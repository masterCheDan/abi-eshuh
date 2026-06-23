import { useEffect, useState } from 'react'
import { useStudentStore } from './stores/useStudentStore'
import type { Student } from './types/student'
function App() {
  const { students, loading, error, loadStudents } = useStudentStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  // 搜索过滤
  const filtered = students
    ? Object.values(students).filter(
      (s) =>
        !search ||
        s.Name.toLowerCase().includes(search.toLowerCase()) ||
        s.School.toLowerCase().includes(search.toLowerCase())
    )
    : []

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">🎯 Abi-Eshuh</h1>

      {/* 加载状态 */}
      {loading && <p className="text-gray-400">加载学生数据中...</p>}
      {error && <p className="text-red-400">错误: {error}</p>}

      {students && (
        <>
          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索学生名称或学校..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 rounded bg-gray-800 border border-gray-700 text-white mb-4"
          />

          {/* 统计信息 */}
          <p className="text-sm text-gray-400 mb-4">
            共 {Object.keys(students).length} 名学生
            {search && `，搜索到 ${filtered.length} 名`}
          </p>

          {/* 学生列表 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {filtered.slice(0, 48).map((s) => (
              <StudentCard key={s.Id} student={s} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StudentCard({ student }: { student: Student }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-blue-500 transition-colors">
      <div className="font-semibold text-sm truncate">{student.Name}</div>
      <div className="text-xs text-gray-400 mt-1">
        {student.School} · {student.Position}
      </div>
      <div className="flex gap-1 mt-1">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700">{student.BulletType}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700">{student.ArmorType}</span>
      </div>
    </div>
  )
}

export default App

