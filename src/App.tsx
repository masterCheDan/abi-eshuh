import { useEffect } from 'react'
import { useStudentStore } from './stores/useStudentStore'
import { useThemeStore, type ThemeMode } from './stores/useThemeStore'
import { Timeline } from './components/timeline/Timeline'
import { EventLog } from './components/timeline/EventLog'
import { SquadPanel } from './components/squad/SquadPanel'
import { SkillPanel } from './components/skill-panel/SkillPanel'
import { I18nProvider, useI18n } from './i18n'
import type { SupportedLocale } from './i18n'

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const THEME_LABELS: Record<ThemeMode, string> = { light: '☀️', dark: '🌙', auto: '🔄' }

function AppContent() {
  const { loadStudents } = useStudentStore()
  const { locale, setLocale } = useI18n()
  const { mode, setMode } = useThemeStore()

  useEffect(() => {
    loadStudents()
    // 初始化主题（只执行一次）
    useThemeStore.getState().setMode('dark')
  }, [loadStudents])

  return (
    <div className="h-screen flex flex-col text-[color:var(--text-primary)]" style={{ background: 'var(--bg-app)' }}>
      {/* 顶部标题栏 */}
      <header className="shrink-0 px-4 py-2 border-b flex items-center justify-center relative" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <h1 className="text-2xl font-game tracking-wide">
          <span className="text-[color:var(--text-primary)]">Abi-</span>
          <span className="text-blue-400">Eshuh</span>
        </h1>

        <div className="absolute right-4 flex items-center gap-2">
          {/* 主题切换 */}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ThemeMode)}
            className="text-xs rounded px-2 py-1 border"
            style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {Object.entries(THEME_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* 语言切换 */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as SupportedLocale)}
            className="text-xs rounded px-2 py-1 border"
            style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {Object.entries(LOCALE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 左侧面板 */}
        <aside className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
          <SquadPanel />
          <SkillPanel />
        </aside>

        {/* 右侧时间轴 + 事件日志 */}
        <main className="flex-1 min-w-0 flex gap-3">
          <div className="flex-1 min-w-0">
            <Timeline />
          </div>
          <aside className="w-64 shrink-0">
            <EventLog />
          </aside>
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
