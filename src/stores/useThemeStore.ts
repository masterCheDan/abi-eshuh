import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'auto'

function detectSystemTheme(): 'light' | 'dark' {
    const h = new Date().getHours()
    return h >= 6 && h < 18 ? 'light' : 'dark'
}

interface ThemeStore {
    mode: ThemeMode
    /** 当前实际渲染的主题 */
    resolved: 'light' | 'dark'
    setMode: (mode: ThemeMode) => void
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
    return mode === 'auto' ? detectSystemTheme() : mode
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
    mode: 'dark',
    resolved: 'dark',

    setMode: (mode) => {
        const resolved = resolve(mode)
        const root = document.documentElement
        if (resolved === 'light') {
            root.classList.add('light')
            root.classList.remove('dark')
        } else {
            root.classList.add('dark')
            root.classList.remove('light')
        }
        set({ mode, resolved })
    },
}))
