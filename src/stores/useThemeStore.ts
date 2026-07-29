import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'auto'

const LS_KEY = 'abi-theme-mode'

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

function applyToDom(resolved: 'light' | 'dark'): void {
    const root = document.documentElement
    if (resolved === 'light') {
        root.classList.add('light')
        root.classList.remove('dark')
    } else {
        root.classList.add('dark')
        root.classList.remove('light')
    }
}

function loadInitialMode(): ThemeMode {
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
    } catch { /* ignore */ }
    return 'auto'
}

const initialMode = loadInitialMode()
const initialResolved = resolve(initialMode)
applyToDom(initialResolved)

export const useThemeStore = create<ThemeStore>((set) => ({
    mode: initialMode,
    resolved: initialResolved,

    setMode: (mode) => {
        const resolved = resolve(mode)
        applyToDom(resolved)
        try { localStorage.setItem(LS_KEY, mode) } catch { /* ignore */ }
        set({ mode, resolved })
    },
}))
