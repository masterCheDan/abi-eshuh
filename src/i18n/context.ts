import { createContext } from 'react'
import { zh } from './zh'
import { en } from './en'
import { ja } from './ja'
import type { LanguagePack } from './zh'

export type SupportedLocale = 'zh' | 'en' | 'ja'

export const PACKS: Record<SupportedLocale, LanguagePack> = { zh, en, ja }

export interface I18nContextType {
  /** 当前语言标识 */
  locale: SupportedLocale
  /** 当前语言的翻译包 */
  t: LanguagePack
  /** 切换语言 */
  setLocale: (locale: SupportedLocale) => void
}

export const I18nContext = createContext<I18nContextType | null>(null)
