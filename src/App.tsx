import { useEffect } from 'react'
import { useStudentStore } from './stores/useStudentStore'
import { restoreFromStorage } from './stores/squadTimeline'
import { useSimulationStore } from './stores/useSimulationStore'
import { useThemeStore, type ThemeMode } from './stores/useThemeStore'
import { Timeline } from './components/timeline/Timeline'
import { EventLog } from './components/timeline/EventLog'
import { EffectAuditPanel } from './components/timeline/EffectAuditPanel'
import { SquadPanel } from './components/squad/SquadPanel'
import { NsSchedulingPanel } from './components/squad/NsSchedulingPanel'
import { CardOrderEditor } from './components/squad/CardOrderEditor'
import { SkillPanel } from './components/skill-panel/SkillPanel'
import { BossPanel } from './components/boss-panel/BossPanel'
import { I18nProvider, useI18n } from './i18n'
import type { SupportedLocale } from './i18n'

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const THEME_LABELS: Record<ThemeMode, string> = { light: '☀ Light', dark: '🌙 Dark', auto: '🔄 Auto' }

function AppContent() {
  const { loadStudents, getStudent } = useStudentStore()
  const { locale, setLocale } = useI18n()
  const { mode, setMode } = useThemeStore()

  useEffect(() => {
    loadStudents().then(() => {
      restoreFromStorage(getStudent)
      // 初始推演
      useSimulationStore.getState().tick()
    })
  }, [loadStudents, getStudent])

  return (
    <div className="h-screen flex flex-col text-[color:var(--text-primary)]" style={{ background: 'var(--bg-app)' }}>
      {/* 顶部标题栏 */}
      <header className="ba-header shrink-0 px-4 py-2 flex items-center justify-center relative">
        <h1 className="text-2xl font-game tracking-wide">
          <span className="text-[color:var(--text-primary)]">Abi-</span>
          <span style={{ color: 'var(--accent)', textShadow: '0 0 10px var(--glow-cyan)' }}>Eshuh</span>
        </h1>

        <div className="absolute right-4 flex items-center gap-2">
          {/* 主题切换 */}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ThemeMode)}
            className="ba-cut-btn text-xs px-2 py-1 border"
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
            className="ba-cut-btn text-xs px-2 py-1 border"
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
        <aside className="shrink-0 flex flex-col gap-3 overflow-y-auto" style={{ width: 'clamp(400px, 28vw, 580px)' }}>
          <BossPanel />
          <SquadPanel />
          <NsSchedulingPanel />
          <CardOrderEditor />
          <SkillPanel />
        </aside>

        {/* 右侧时间轴 + 事件日志 */}
        <main className="flex-1 min-w-0 flex gap-3">
          <div className="flex-1 min-w-0">
            <Timeline />
          </div>
          <aside className="shrink-0 flex flex-col gap-3" style={{ width: 'clamp(200px, 14vw, 300px)' }}>
            <div className="flex-1 min-h-0"><EventLog /></div>
            <EffectAuditPanel />
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
