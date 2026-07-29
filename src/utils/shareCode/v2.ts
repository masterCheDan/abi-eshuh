/** 分享码 v2：保存所有学生技能事件、多个目标与触发来源。 */
import type { SkillRef, TriggerSource, ShareCodePayloadV2 } from '../../engine/model/types'
import type { StudentLane } from '../../types/timeline'

export const VERSION = '2.0.0' as const

function findSlotByStudentId(lanes: StudentLane[], studentId: number): number {
  return lanes.find(lane => lane.student?.Id === studentId)?.slotIndex ?? -1
}

function inferRef(skill: StudentLane['skills'][number], lane: StudentLane): SkillRef {
  if (skill.skillRef) return skill.skillRef
  if (skill.type === 'ex') return { kind: 'ex' }
  if (skill.type === 'ns') return lane.student?.HasGear && lane.student.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
  return { kind: 'extra_passive' }
}

export function encode(
  lanes: StudentLane[],
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  deckOrder?: number[],
): string {
  const armorIdx = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor'].indexOf(armorType)
  const events = lanes.flatMap(lane => lane.skills.map(skill => ({
    frame: skill.startFrame,
    casterSlot: lane.slotIndex,
    targetSlots: (skill.targetIds ?? [skill.targetId ?? skill.studentId]).map(id => id === -1 ? -1 : findSlotByStudentId(lanes, id)),
    skillRef: inferRef(skill, lane),
    triggerSource: skill.triggerSource ?? 'manual' as TriggerSource,
  }))).sort((a, b) => a.frame - b.frame)
  const payload: ShareCodePayloadV2 = {
    ver: VERSION,
    env: [bossId, difficulty, armorIdx >= 0 ? armorIdx : 2, terrain],
    form: [...lanes].sort((a, b) => a.slotIndex - b.slotIndex).map(lane => lane.student?.Id ?? null),
    events,
  }
  if (deckOrder?.length) payload.init = deckOrder
  return JSON.stringify(payload)
}

export interface ImportEventV2 {
  frame: number
  casterSlot: number
  targetSlots: number[]
  skillRef: SkillRef
  triggerSource: TriggerSource
}

export interface ImportDataV2 {
  studentIds: number[]
  skills: ImportEventV2[]
  env: { bossId: number; difficulty: number; armorType: string; terrain: number }
  deckOrder: number[]
}

export function decode(raw: string): ImportDataV2 | null {
  try {
    const payload = JSON.parse(raw) as ShareCodePayloadV2
    if (payload.ver !== VERSION || !Array.isArray(payload.form) || !Array.isArray(payload.events)) return null
    const armorTypes = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor']
    return {
      studentIds: payload.form.map(id => id ?? -1),
      skills: payload.events.map(event => ({
        frame: event.frame,
        casterSlot: event.casterSlot,
        targetSlots: event.targetSlots ?? [],
        skillRef: event.skillRef,
        triggerSource: event.triggerSource ?? 'manual',
      })),
      env: { bossId: payload.env[0], difficulty: payload.env[1], armorType: armorTypes[payload.env[2]] ?? 'LightArmor', terrain: payload.env[3] },
      deckOrder: payload.init ?? [],
    }
  } catch {
    return null
  }
}
