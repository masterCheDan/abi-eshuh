/** 分享码 v4：严格校验、规范化 slot，并保存可复现的事件事实。 */
import type { SkillRef, TriggerEvidence, TriggerSource, ManualTriggerReason } from '../../engine/model/types'
import type { StudentLane } from '../../types/timeline'
import type { SquadSlot } from '../../types/squad'

export const VERSION = '4.0.0' as const
const armorTypes = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor'] as const
const skillKinds = new Set<SkillRef['kind']>(['ex', 'public', 'gear_public', 'passive', 'weapon_passive', 'extra_passive', 'extra_ex'])
const triggerSources = new Set<TriggerSource>(['automatic', 'manual'])
const triggerReasons = new Set<ManualTriggerReason>(['chance', 'random_target', 'hp_threshold', 'external_state', 'action_event', 'interval'])

export interface SummonRefV4 { summonId: number; sourceEventId: string; spawnIndex: number }
export interface ImportEventV4 {
  eventId: string
  frame: number
  casterSlot: number
  targetSlots: number[]
  targetSummonRefs?: SummonRefV4[]
  /** legacy v4 field; only accepted as opaque refs for compatibility */
  targetSummonIds?: string[]
  skillRef: SkillRef
  trigger: TriggerEvidence
  triggerSource: TriggerEvidence['source']
  skillCost?: number
  skillDuration?: number
  overrideOffset?: number
}
export interface ImportDataV4 {
  studentIds: number[]
  skills: ImportEventV4[]
  env: { bossId: number; difficulty: number; armorType: string; terrain: number }
  deckOrder: number[]
  ranks: Array<[number, number] | null>
}

type RawEvent = Partial<ImportEventV4> & { frame?: unknown; casterSlot?: unknown; targetSlots?: unknown; skillRef?: unknown; trigger?: unknown }
function finiteInt(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) }
function validRef(value: unknown): value is SkillRef {
  if (!value || typeof value !== 'object' || !skillKinds.has((value as SkillRef).kind)) return false
  const ref = value as Extract<SkillRef, { kind: 'extra_ex' }>
  if (ref.kind === 'extra_ex' && ref.extraSkillId == null && ref.extraSkillIndex == null) return false
  return ref.kind !== 'extra_ex' || (ref.extraSkillIndex == null || finiteInt(ref.extraSkillIndex) && ref.extraSkillIndex >= 0)
}
function validTrigger(value: unknown): value is TriggerEvidence {
  if (!value || typeof value !== 'object') return false
  const trigger = value as TriggerEvidence
  if (!triggerSources.has(trigger.source)) return false
  if (trigger.reasons && (!Array.isArray(trigger.reasons) || trigger.reasons.some(reason => !triggerReasons.has(reason)))) return false
  return trigger.conditionEndFrame == null || finiteInt(trigger.conditionEndFrame) && trigger.conditionEndFrame >= 0
}
function validSummonRefs(value: unknown): value is SummonRefV4[] {
  return value == null || Array.isArray(value) && value.every(ref => !!ref && finiteInt(ref.summonId) && ref.summonId >= 0 && typeof ref.sourceEventId === 'string' && ref.sourceEventId.length > 0 && finiteInt(ref.spawnIndex) && ref.spawnIndex >= 0)
}
function slotMap(lanes: StudentLane[]) {
  const sorted = [...lanes].sort((a, b) => a.slotIndex - b.slotIndex)
  const denseByRaw = new Map(sorted.map((lane, index) => [lane.slotIndex, index]))
  const denseByStudent = new Map(sorted.flatMap((lane, index) => lane.student ? [[lane.student.Id, index] as const] : []))
  return { sorted, denseByRaw, denseByStudent }
}
function refOf(skill: StudentLane['skills'][number], lane: StudentLane): SkillRef {
  if (skill.skillRef) return skill.skillRef
  if (skill.type === 'ex') return { kind: 'ex' }
  if (skill.type === 'ns') return lane.student?.HasGear && lane.student.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
  return { kind: 'extra_passive' }
}
function triggerOf(skill: StudentLane['skills'][number]): TriggerEvidence { return skill.trigger ?? { source: skill.triggerSource ?? 'manual' } }
function eventIdOf(skill: StudentLane['skills'][number], denseCaster: number, ordinal: number): string { return skill.eventId ?? `e-${denseCaster}-${skill.startFrame}-${ordinal}` }

export function encode(lanes: StudentLane[], bossId = 0, difficulty = 5, armorType = 'LightArmor', terrain = 0, deckOrder?: number[], squadSlots?: SquadSlot[]): string {
  const { sorted, denseByRaw, denseByStudent } = slotMap(lanes)
  const armorIndex = armorTypes.indexOf(armorType as typeof armorTypes[number])
  if (armorIndex < 0) throw new Error(`Unsupported armor type: ${armorType}`)
  const ordinals = new Map<number, number>()
  const events = lanes.flatMap(lane => {
    const casterSlot = denseByRaw.get(lane.slotIndex)
    if (casterSlot == null) return []
    return lane.skills.map(skill => {
      const ordinal = ordinals.get(lane.slotIndex) ?? 0
      ordinals.set(lane.slotIndex, ordinal + 1)
      const trigger = triggerOf(skill)
      return {
        eventId: eventIdOf(skill, casterSlot, ordinal), frame: skill.startFrame, casterSlot,
        targetSlots: (skill.targetIds ?? [skill.targetId ?? skill.studentId]).map(id => id === -1 ? -1 : (denseByStudent.get(id) ?? -2)),
        ...(skill.targetSummonIds?.length ? { targetSummonIds: skill.targetSummonIds } : {}),
        skillRef: refOf(skill, lane), triggerSource: trigger.source, trigger,
        ...(skill.skillCost != null ? { skillCost: skill.skillCost } : {}),
        ...(skill.skillDuration != null ? { skillDuration: skill.skillDuration } : {}),
        ...(skill.overrideOffset != null ? { overrideOffset: skill.overrideOffset } : {}),
      }
    })
  }).sort((a, b) => a.frame - b.frame || a.casterSlot - b.casterSlot || a.eventId.localeCompare(b.eventId))
  const denseDeck = deckOrder?.length ? deckOrder.map(raw => denseByRaw.get(raw) ?? -2) : undefined
  const payload = {
    ver: VERSION,
    env: [bossId, difficulty, armorIndex, terrain] as [number, number, number, number],
    form: sorted.map(lane => lane.student?.Id ?? null), events,
    ...(denseDeck ? { init: denseDeck } : {}),
    ...(squadSlots ? { ranks: sorted.map(lane => { const slot = squadSlots.find(value => value.index === lane.slotIndex); return lane.student && slot ? [slot.starLevel, slot.uniqueWeaponLevel] : null }) } : {}),
  }
  return JSON.stringify(payload)
}

export function decode(raw: string): ImportDataV4 | null {
  try {
    const payload = JSON.parse(raw) as { ver?: unknown; env?: unknown; form?: unknown; init?: unknown; ranks?: unknown; events?: unknown }
    if (payload.ver !== VERSION || !Array.isArray(payload.form) || payload.form.length < 1 || payload.form.length > 10 || !Array.isArray(payload.events)) return null
    const form = payload.form
    if (!Array.isArray(payload.env) || payload.env.length !== 4 || payload.env.some(value => !finiteInt(value))) return null
    const [bossId, difficulty, armorIndex, terrain] = payload.env
    if (bossId < 0 || difficulty < 0 || difficulty > 7 || armorIndex < 0 || armorIndex >= armorTypes.length || terrain < 0 || terrain > 2) return null
    if (payload.form.some(id => id !== null && (!finiteInt(id) || id < 0))) return null
    const seen = new Set<string>()
    const skills: ImportEventV4[] = []
    for (const rawEvent of payload.events as RawEvent[]) {
      if (typeof rawEvent.eventId !== 'string' || !rawEvent.eventId || seen.has(rawEvent.eventId) || !finiteInt(rawEvent.frame) || rawEvent.frame < 0 || !finiteInt(rawEvent.casterSlot) || rawEvent.casterSlot < 0 || rawEvent.casterSlot >= form.length || !Array.isArray(rawEvent.targetSlots) || !validRef(rawEvent.skillRef) || !validTrigger(rawEvent.trigger)) return null
      if (rawEvent.targetSlots.some(slot => !finiteInt(slot) || slot < -1 || slot >= form.length)) return null
      if (!validSummonRefs(rawEvent.targetSummonRefs)) return null
      if (rawEvent.targetSummonIds && (!Array.isArray(rawEvent.targetSummonIds) || rawEvent.targetSummonIds.some(id => typeof id !== 'string'))) return null
      if (rawEvent.skillCost != null && (typeof rawEvent.skillCost !== 'number' || !Number.isFinite(rawEvent.skillCost) || rawEvent.skillCost < 0)) return null
      if (rawEvent.skillDuration != null && (!finiteInt(rawEvent.skillDuration) || rawEvent.skillDuration < 0)) return null
      if (rawEvent.overrideOffset != null && !finiteInt(rawEvent.overrideOffset)) return null
      seen.add(rawEvent.eventId)
      skills.push({ ...rawEvent, eventId: rawEvent.eventId, frame: rawEvent.frame, casterSlot: rawEvent.casterSlot, targetSlots: rawEvent.targetSlots, skillRef: rawEvent.skillRef, trigger: rawEvent.trigger, triggerSource: rawEvent.triggerSource ?? rawEvent.trigger.source })
    }
    const deckOrder = payload.init ?? []
    if (!Array.isArray(deckOrder) || deckOrder.some(slot => !finiteInt(slot) || slot < 0 || slot >= form.length) || new Set(deckOrder).size !== deckOrder.length) return null
    const ranks = payload.ranks ?? form.map(() => null)
    if (!Array.isArray(ranks) || ranks.length !== form.length || ranks.some((rank, i) => rank !== null && (!Array.isArray(rank) || rank.length !== 2 || rank.some(value => !finiteInt(value) || value < 0) || form[i] === null))) return null
    return { studentIds: form.map(id => id ?? -1), skills, env: { bossId, difficulty, armorType: armorTypes[armorIndex], terrain }, deckOrder, ranks }
  } catch { return null }
}
