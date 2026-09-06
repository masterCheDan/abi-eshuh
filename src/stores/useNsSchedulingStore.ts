import { create } from 'zustand'
import type { NsSchedulingConfig } from '../engine'
import { rules } from '../domain/rules/GameRules'

const LS_KEY = 'abi-ns-scheduling'
type NsMode = NsSchedulingConfig['nsModes'][number]

export function defaultNsScheduling(slotCount: number): NsSchedulingConfig {
  return { enabled: false, ruleVersion: rules.nsScheduling.version, nsModes: Array(slotCount).fill('manual') }
}

/** Keeps a local preference usable while never making an empty slot automatic. */
export function alignNsScheduling(config: NsSchedulingConfig, studentIds: readonly (number | null)[]): NsSchedulingConfig {
  return {
    enabled: config.enabled,
    ruleVersion: config.ruleVersion,
    nsModes: studentIds.map((studentId, slot) => studentId == null ? 'manual' : config.nsModes[slot] ?? 'manual'),
  }
}

function load(): NsSchedulingConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? '') as Partial<NsSchedulingConfig>
    if (typeof parsed.enabled !== 'boolean' || parsed.ruleVersion !== rules.nsScheduling.version || !Array.isArray(parsed.nsModes)
      || parsed.nsModes.some(mode => mode !== 'manual' && mode !== 'automatic')) return defaultNsScheduling(6)
    return { enabled: parsed.enabled, ruleVersion: parsed.ruleVersion, nsModes: [...parsed.nsModes] }
  } catch { return defaultNsScheduling(6) }
}

interface NsSchedulingStore {
  config: NsSchedulingConfig
  setEnabled: (enabled: boolean) => void
  setMode: (slotIndex: number, mode: NsMode) => void
  clearSlot: (slotIndex: number) => void
  resize: (studentIds: readonly (number | null)[]) => void
  replaceConfig: (config: NsSchedulingConfig, studentIds: readonly (number | null)[]) => void
}

export const useNsSchedulingStore = create<NsSchedulingStore>((set) => ({
  config: load(),
  setEnabled: enabled => set(state => ({ config: { ...state.config, enabled } })),
  setMode: (slotIndex, mode) => set(state => {
    const nsModes = [...state.config.nsModes]
    nsModes[slotIndex] = mode
    return { config: { ...state.config, nsModes } }
  }),
  clearSlot: slotIndex => set(state => {
    const nsModes = [...state.config.nsModes]
    nsModes[slotIndex] = 'manual'
    return { config: { ...state.config, nsModes } }
  }),
  resize: studentIds => set(state => ({ config: alignNsScheduling(state.config, studentIds) })),
  replaceConfig: (config, studentIds) => set({ config: alignNsScheduling(config, studentIds) }),
}))

useNsSchedulingStore.subscribe(state => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.config)) } catch { /* storage may be unavailable */ }
})
