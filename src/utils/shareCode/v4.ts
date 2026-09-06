/** 分享码 v4：严格校验、规范化 slot，并保存可复现的事件事实。 */
import type { SkillRef, TriggerEvidence } from '../../engine'
import { normalizeTrigger } from '../../domain/triggerEvidence'
import type { StudentLane } from '../../types/timeline'
import type { SquadSlot } from '../../types/squad'

export const VERSION = '4.0.0' as const
const armorTypes = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor'] as const
const skillKinds = new Set<SkillRef['kind']>(['ex', 'public', 'gear_public', 'passive', 'weapon_passive', 'extra_passive', 'extra_ex'])

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
  levels?: Array<[number, number, number] | null>
  maxFrame?: number
  studentIds: number[]
  skills: ImportEventV4[]
  env: { bossId: number; difficulty: number; armorType: string; terrain: number }
  deckOrder: number[]
  ranks: Array<[number, number] | null>
  /** 爱用品状态（0=未装备，1=T1，2=T2），按槽位对齐；旧码缺失时默认 1。 */
  gear: number[]
}

type RawEvent = Partial<ImportEventV4> & { frame?: unknown; casterSlot?: unknown; targetSlots?: unknown; skillRef?: unknown; trigger?: unknown }
function finiteInt(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) }
function validRef(value: unknown): value is SkillRef {
  if (!value || typeof value !== 'object' || !skillKinds.has((value as SkillRef).kind)) return false
  const ref = value as Extract<SkillRef, { kind: 'extra_ex' }>
  if (ref.extraSkillId != null && (typeof ref.extraSkillId !== 'string' || !ref.extraSkillId)) return false
  if (ref.kind === 'extra_ex' && ref.extraSkillId == null && ref.extraSkillIndex == null) return false
  return ref.kind !== 'extra_ex' || (ref.extraSkillIndex == null || finiteInt(ref.extraSkillIndex) && ref.extraSkillIndex >= 0)
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
function refOf(skill: StudentLane['skills'][number], lane: StudentLane, gearLevel: number): SkillRef {
  if (skill.skillRef) return skill.skillRef
  if (skill.type === 'ex') return { kind: 'ex' }
  if (skill.type === 'ns') return gearLevel > 0 && lane.student?.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
  return { kind: 'extra_passive' }
}
function triggerOf(skill: StudentLane['skills'][number]): TriggerEvidence {
  const result = normalizeTrigger(skill)
  if ('error' in result) throw new Error(result.error)
  return result.trigger
}
function eventIdOf(skill: StudentLane['skills'][number], denseCaster: number, ordinal: number): string { return skill.eventId ?? `e-${denseCaster}-${skill.startFrame}-${ordinal}` }
function summonRefOf(id: string): SummonRefV4 | null {
  const match = /^summon-(.+)-([0-9]+)-([0-9]+)$/.exec(id)
  if (!match) return null
  return { sourceEventId: match[1]!, summonId: Number(match[2]), spawnIndex: Number(match[3]) }
}

export function encode(lanes: StudentLane[], bossId = 0, difficulty = 5, armorType = 'LightArmor', terrain = 0, deckOrder?: number[], squadSlots?: SquadSlot[], maxFrame = 5400): string {
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
      const targetSummonRefs = [...(skill.targetSummonRefs ?? [])]
      const targetSummonIds: string[] = []
      for (const id of skill.targetSummonIds ?? []) {
        const ref = summonRefOf(id)
        if (ref) targetSummonRefs.push(ref)
        else targetSummonIds.push(id) // Preserve legacy facts; never silently drop an unresolved target.
      }
      return {
        eventId: eventIdOf(skill, casterSlot, ordinal), frame: skill.startFrame, casterSlot,
        targetSlots: (skill.targetIds ?? [skill.targetId ?? skill.studentId]).map(id => {
          if (id === -1) return -1
          const slot = denseByStudent.get(id)
          if (slot == null) throw new Error(`Unknown target student: ${id}`)
          return slot
        }),
        ...(targetSummonRefs.length ? { targetSummonRefs } : {}),
        ...(targetSummonIds.length ? { targetSummonIds } : {}),
        skillRef: refOf(skill, lane, squadSlots?.find(item => item.index === lane.slotIndex)?.gearLevel ?? 1), triggerSource: trigger.source, trigger,
        ...(skill.skillCost != null ? { skillCost: skill.skillCost } : {}),
        ...(skill.skillDuration != null ? { skillDuration: skill.skillDuration } : {}),
        ...(skill.overrideOffset != null ? { overrideOffset: skill.overrideOffset } : {}),
      }
    })
  }).sort((a, b) => a.frame - b.frame || a.casterSlot - b.casterSlot)
  const denseDeck = deckOrder?.length ? deckOrder.map(raw => denseByRaw.get(raw) ?? -2) : undefined
  const gear = sorted.map(lane => {
    const slot = squadSlots?.find(item => item.index === lane.slotIndex)
    return slot?.gearLevel ?? 1
  })
  const payload = {
    ver: VERSION,
    maxFrame,
    levels: sorted.map(lane => {
      if (!lane.student) return null
      const slot = squadSlots?.find(item => item.index === lane.slotIndex)
      return [slot?.exLevel ?? 5, slot?.nsLevel ?? 10, slot?.ssLevel ?? 10]
    }),
    env: [bossId, difficulty, armorIndex, terrain] as [number, number, number, number],
    form: sorted.map(lane => lane.student?.Id ?? null), events,
    gear,
    ...(denseDeck ? { init: denseDeck } : {}),
    ...(squadSlots ? { ranks: sorted.map(lane => { const slot = squadSlots.find(value => value.index === lane.slotIndex); return lane.student && slot ? [slot.starLevel, slot.uniqueWeaponLevel] : null }) } : {}),
  }
  const raw = JSON.stringify(payload)
  if (!decode(raw)) throw new Error('分享配置含非法槽位、等级、帧数或事件字段')
  return raw
}

export function decode(raw: string): ImportDataV4 | null {
  try {
    const payload = JSON.parse(raw) as { ver?: unknown; env?: unknown; form?: unknown; init?: unknown; ranks?: unknown; gear?: unknown; events?: unknown; levels?: unknown; maxFrame?: unknown }
    if (payload.ver !== VERSION || !Array.isArray(payload.form) || payload.form.length < 1 || payload.form.length > 10 || !Array.isArray(payload.events)) return null
    const form = payload.form
    if (payload.maxFrame !== undefined && (!finiteInt(payload.maxFrame) || payload.maxFrame < 0)) return null
    if (payload.levels !== undefined && (!Array.isArray(payload.levels) || payload.levels.length !== form.length || payload.levels.some((level, index) => form[index] === null ? level !== null : !Array.isArray(level) || level.length !== 3 || level.some((n, i) => !finiteInt(n) || n < 1 || n > (i === 0 ? 5 : 10))))) return null
    if (!Array.isArray(payload.env) || payload.env.length !== 4 || payload.env.some(value => !finiteInt(value))) return null
    const [bossId, difficulty, armorIndex, terrain] = payload.env
    if (bossId < 0 || difficulty < 0 || difficulty > 7 || armorIndex < 0 || armorIndex >= armorTypes.length || terrain < 0 || terrain > 2) return null
    if (payload.form.some(id => id !== null && (!finiteInt(id) || id < 0))) return null
    const seen = new Set<string>()
    const skills: ImportEventV4[] = []
    for (const rawEvent of payload.events as RawEvent[]) {
      if (!rawEvent || typeof rawEvent !== 'object') return null
      const normalized = normalizeTrigger(rawEvent)
      if ('error' in normalized) return null
      if (typeof rawEvent.eventId !== 'string' || !rawEvent.eventId || seen.has(rawEvent.eventId) || !finiteInt(rawEvent.frame) || rawEvent.frame < 0 || !finiteInt(rawEvent.casterSlot) || rawEvent.casterSlot < 0 || rawEvent.casterSlot >= form.length || form[rawEvent.casterSlot] === null || !Array.isArray(rawEvent.targetSlots) || !validRef(rawEvent.skillRef)) return null
      if (rawEvent.targetSlots.some(slot => !finiteInt(slot) || slot < -1 || slot >= form.length || slot >= 0 && form[slot] === null)) return null
      if (!validSummonRefs(rawEvent.targetSummonRefs)) return null
      if (rawEvent.targetSummonIds && (!Array.isArray(rawEvent.targetSummonIds) || rawEvent.targetSummonIds.some(id => typeof id !== 'string'))) return null
      if (rawEvent.skillCost != null && (typeof rawEvent.skillCost !== 'number' || !Number.isFinite(rawEvent.skillCost) || rawEvent.skillCost < 0)) return null
      if (rawEvent.skillDuration != null && (!finiteInt(rawEvent.skillDuration) || rawEvent.skillDuration < 0)) return null
      if (rawEvent.overrideOffset != null && !finiteInt(rawEvent.overrideOffset)) return null
      seen.add(rawEvent.eventId)
      skills.push({ ...rawEvent, ...normalized, eventId: rawEvent.eventId, frame: rawEvent.frame, casterSlot: rawEvent.casterSlot, targetSlots: rawEvent.targetSlots, skillRef: rawEvent.skillRef })
    }
    const deckOrder = payload.init ?? []
    if (!Array.isArray(deckOrder) || deckOrder.some(slot => !finiteInt(slot) || slot < 0 || slot >= form.length) || new Set(deckOrder).size !== deckOrder.length) return null
    const ranks = payload.ranks ?? form.map(() => null)
    if (!Array.isArray(ranks) || ranks.length !== form.length || ranks.some((rank, i) => rank !== null && (!Array.isArray(rank) || rank.length !== 2 || rank.some(value => !finiteInt(value) || value < 0) || form[i] === null))) return null
    const gear = payload.gear ?? form.map(() => 1)
    if (!Array.isArray(gear) || gear.length !== form.length || gear.some(value => value !== 0 && value !== 1 && value !== 2)) return null
    return { studentIds: form.map(id => id ?? -1), skills, env: { bossId, difficulty, armorType: armorTypes[armorIndex], terrain }, deckOrder, ranks, gear, levels: payload.levels as ImportDataV4['levels'], maxFrame: payload.maxFrame as number | undefined }
  } catch { return null }
}
