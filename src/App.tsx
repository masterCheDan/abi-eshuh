import { useEffect } from 'react'
import { useStudentStore } from './stores/useStudentStore'
import { Timeline } from './components/timeline/Timeline'
import { SquadPanel } from './components/squad/SquadPanel'
import { SkillPanel } from './components/skill-panel/SkillPanel'
import { I18nProvider, useI18n, tpl } from './i18n'
import type { SupportedLocale } from './i18n'

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

function AppContent() {
  const { loadStudents } = useStudentStore()
  const { t, locale, setLocale } = useI18n()

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* 顶部标题栏 */}
      <header className="shrink-0 px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
        <h1 className="text-lg font-bold">🎯 {t.app.title}</h1>

        {/* 语言切换 */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as SupportedLocale)}
          className="bg-gray-700 text-xs text-gray-300 rounded px-2 py-1 border border-gray-600"
        >
          {Object.entries(LOCALE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 左侧面板 */}
        <aside className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
          <SquadPanel />
          <SkillPanel />
        </aside>

        {/* 右侧时间轴 */}
        <main className="flex-1 min-w-0">
          <Timeline />
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}

export default App
