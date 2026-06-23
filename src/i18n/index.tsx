import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { zh, type LanguagePack } from './zh'
import { en } from './en'
import { ja } from './ja'

export type SupportedLocale = 'zh' | 'en' | 'ja'

const PACKS: Record<SupportedLocale, LanguagePack> = { zh, en, ja }

interface I18nContextType {
  /** 当前语言标识 */
  locale: SupportedLocale
  /** 当前语言的翻译包 */
  t: LanguagePack
  /** 切换语言 */
  setLocale: (locale: SupportedLocale) => void
}

const I18nContext = createContext<I18nContextType | null>(null)

/** 在组件中使用：const { t } = useI18n() */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

/** 带参数翻译的辅助函数：tpl(t.skill.cost, { cost: 4 }) */
export function tpl(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    // 优先使用 localStorage 保存的语言偏好
    const saved = localStorage.getItem('abi-i18n-locale') as SupportedLocale | null
    if (saved && saved in PACKS) return saved

    // 其次使用浏览器语言
    const lang = navigator.language.slice(0, 2)
    if (lang in PACKS) return lang as SupportedLocale
    return 'zh'
  })

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    localStorage.setItem('abi-i18n-locale', newLocale)
    setLocaleState(newLocale)
  }, [])

  return (
    <I18nContext.Provider value={{ locale, t: PACKS[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}
