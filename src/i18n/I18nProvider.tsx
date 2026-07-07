import { type ReactNode, useState, useCallback } from 'react'
import { I18nContext, PACKS } from './context'
import type { SupportedLocale } from './context'

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
