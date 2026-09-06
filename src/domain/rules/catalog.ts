import data from './catalog.json'

export type SupportLevel = 'implemented' | 'manual_fact' | 'state_only' | 'partial'
export interface RulePolicy {
  id: string
  handler: string
  status: SupportLevel
  strategy: string
  limitations?: string
}
export interface SpecialPolicy extends RulePolicy {
  unlocksExtraEx?: boolean
  durationMs?: number
}
export interface TriggerPolicy extends RulePolicy {
  mode: string
  reasons?: readonly string[]
}

/** Pure-data, versioned source shared with the Node coverage command. */
export const catalog = data
export const specialPolicies: Readonly<Record<string, SpecialPolicy>> = data.policies.specials as Record<string, SpecialPolicy>
export const triggerPolicies = data.triggers as Readonly<Record<string, TriggerPolicy>>
export const skillPolicies = data.skills as Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>
export function effectPolicy(type: string): RulePolicy | undefined {
  return (data.policies.effects as Readonly<Record<string, RulePolicy>>)[type]
}

export function registeredManualReasons(studentId: number, path: string): readonly string[] | undefined {
  const policy = skillPolicies[studentId]?.[path]?.map(id => triggerPolicies[id]).find(policy => policy?.mode === 'manual')
  return policy?.reasons
}
