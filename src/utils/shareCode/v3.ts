/** 分享码 v3：保留用户确认的触发事实与条件结束帧。 */
import type { ShareCodePayloadV3, SkillRef, TriggerEvidence } from '../../engine'
import type { StudentLane } from '../../types/timeline'
import type { SquadSlot } from '../../types/squad'
import { normalizeTrigger } from '../../domain/triggerEvidence'

export const VERSION = '3.0.0' as const
const armorTypes = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor']
const slotOf = (lanes: StudentLane[], id: number) => lanes.find(l => l.student?.Id === id)?.slotIndex ?? -1
function refOf(skill: StudentLane['skills'][number], lane: StudentLane, gearLevel: number): SkillRef {
  if (skill.skillRef) return skill.skillRef
  if (skill.type === 'ex') return { kind: 'ex' }
  if (skill.type === 'ns') return gearLevel > 0 && lane.student?.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
  return { kind: 'extra_passive' }
}
function triggerOf(skill: StudentLane['skills'][number]): TriggerEvidence { return skill.trigger ?? { source: skill.triggerSource ?? 'manual' } }

export function encode(
  lanes: StudentLane[],
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  deckOrder?: number[],
  squadSlots?: SquadSlot[],
): string {
  const sortedLanes = [...lanes].sort((a, b) => a.slotIndex - b.slotIndex)
  const payload: ShareCodePayloadV3 = {
    ver: VERSION,
    env: [bossId, difficulty, Math.max(0, armorTypes.indexOf(armorType)), terrain],
    form: sortedLanes.map(lane => lane.student?.Id ?? null),
    events: lanes.flatMap(lane => lane.skills.map(skill => ({
      frame: skill.startFrame, casterSlot: lane.slotIndex,
      targetSlots: (skill.targetIds ?? [skill.targetId ?? skill.studentId]).map(id => id === -1 ? -1 : slotOf(lanes, id)),
      skillRef: refOf(skill, lane, squadSlots?.find(item => item.index === lane.slotIndex)?.gearLevel ?? 1), triggerSource: triggerOf(skill).source, trigger: triggerOf(skill),
    }))).sort((a, b) => a.frame - b.frame),
  }
  if (deckOrder?.length) payload.init = deckOrder
  if (squadSlots) {
    payload.ranks = sortedLanes.map((lane) => {
      const slot = squadSlots.find(item => item.index === lane.slotIndex)
      return lane.student && slot ? [slot.starLevel, slot.uniqueWeaponLevel] : null
    })
  }
  return JSON.stringify(payload)
}

export interface ImportEventV3 { frame: number; casterSlot: number; targetSlots: number[]; skillRef: SkillRef; trigger: TriggerEvidence }
export interface ImportDataV3 {
  studentIds: number[]
  skills: ImportEventV3[]
  env: { bossId: number; difficulty: number; armorType: string; terrain: number }
  deckOrder: number[]
  ranks: Array<[number, number] | null>
}
export function decode(raw: string): ImportDataV3 | null {
  try {
    const payload = JSON.parse(raw) as ShareCodePayloadV3
    if (payload.ver !== VERSION || !Array.isArray(payload.form) || !Array.isArray(payload.events)) return null
    return {
      studentIds: payload.form.map(id => id ?? -1),
      skills: payload.events.map(event => {
        const normalized = normalizeTrigger(event)
        if ('error' in normalized) throw new Error(normalized.error)
        return { ...event, ...normalized, targetSlots: event.targetSlots ?? [] }
      }),
      env: { bossId: payload.env[0], difficulty: payload.env[1], armorType: armorTypes[payload.env[2]] ?? 'LightArmor', terrain: payload.env[3] },
      deckOrder: payload.init ?? [],
      ranks: payload.ranks ?? payload.form.map(() => null),
    }
  } catch { return null }
}
