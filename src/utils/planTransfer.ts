import type { Student } from '../types/student'
import type { BossData } from '../types/boss'
import type { StudentLane } from '../types/timeline'
import type { SquadSlot } from '../types/squad'
import type { BattleEnv, SkillRef } from '../engine/model/types'
import { resolveSkill } from '../engine/system/SkillResolver'
import { decode as decodeV4 } from './shareCode/v4'
import { encodeShareCode } from './shareCode'
import { rules } from '../domain/rules/GameRules'
import type { NsSchedulingConfig } from '../engine/model/types'

export interface PreparedPlan { slots: SquadSlot[]; lanes: StudentLane[]; env: BattleEnv; deckOrder: number[]; nsScheduling: NsSchedulingConfig; warnings: string[] }
export function durationFrames(bosses: Record<string, BossData> | null | undefined, bossId: number, difficulty: number): number {
  return (Object.values(bosses ?? {}).find(b => b.Id === bossId)?.BattleDuration[difficulty] ?? 180) * 30
}

/** Validate all structure before any store writes; battle legality is left to the engine. */
export function preparePlanImport(decoded: { version: string; data: unknown }, students: ReadonlyMap<number, Student>, bosses?: Record<string, BossData> | null): { plan: PreparedPlan } | { error: string } {
  try {
    if (!decoded.data || typeof decoded.data !== 'object') throw new Error('导入数据格式非法')
    const d = decoded.data as Record<string, unknown>
    if (decoded.version === '5.0.0' && d.nsScheduling == null) throw new Error('自动 NS 调度设置缺失')
    if (!Array.isArray(d.studentIds) || !Array.isArray(d.skills)) throw new Error('编队或事件列表缺失')
    const env = (d.env ?? { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0 }) as Record<string, unknown>
    const armors = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor']
    const events = d.skills.map((value, index) => {
      if (!value || typeof value !== 'object') throw new Error('技能事件格式非法')
      const e = value as Record<string, unknown>
      return { ...e, eventId: e.eventId ?? `legacy-${e.casterSlot}-${index}`, skillRef: e.skillRef ?? { kind: 'ex' }, targetSlots: e.targetSlots ?? (e.targetSlot == null ? [] : [e.targetSlot]) }
    })
    const parsed = decodeV4(JSON.stringify({ ver: '4.0.0', form: d.studentIds.map(id => id === -1 ? null : id), events,
      env: [env.bossId, env.difficulty, armors.indexOf(String(env.armorType)), env.terrain],
      init: d.deckOrder ?? [], ranks: d.ranks, gear: d.gear, levels: d.levels, maxFrame: d.maxFrame,
    }))
    if (!parsed) throw new Error('事件来源、槽位、等级或环境字段非法；请检查冲突来源与引用')
    const warnings: string[] = []
    if (!parsed.levels) warnings.push('旧分享码未保存技能等级，使用 EX/NS/SS：5/10/10。')
    if (parsed.maxFrame == null) warnings.push('旧分享码未保存模拟时长，按 Boss 时长推导；无可用数据时为 5400 帧。')
    const scheduling = d.nsScheduling == null
      ? { enabled: false, ruleVersion: rules.nsScheduling.version, nsModes: parsed.studentIds.map(() => 'manual' as const) }
      : d.nsScheduling as NsSchedulingConfig
    try { rules.nsScheduling.validateConfig(scheduling, parsed.studentIds.map(id => id === -1 ? null : id)) }
    catch { throw new Error('自动 NS 调度版本或逐槽位模式非法') }
    if (d.nsScheduling == null) warnings.push('旧分享码未保存自动 NS 调度设置，已关闭自动模式。')
    const mainCount = parsed.studentIds.length > 6 ? 6 : 4
    const slots = parsed.studentIds.map((id, index): SquadSlot => {
      const student = id === -1 ? null : students.get(id)
      if (student === undefined) throw new Error(`未知学生：${id}`)
      const rank = parsed.ranks[index]
      const starLevel = student ? rank?.[0] ?? student.StarGrade : 0
      const uniqueWeaponLevel = student ? rank?.[1] ?? 0 : 0
      if (student && (starLevel < student.StarGrade || starLevel > 5 || uniqueWeaponLevel > 4 || uniqueWeaponLevel > 0 && starLevel !== 5)) throw new Error(`学生 ${id} 的星级或专武配置非法`)
      const level = parsed.levels?.[index] ?? [5, 10, 10]
      return { index, student, locked: !!student, slotType: index < mainCount ? 'Main' : 'Support', label: index < mainCount ? `STRIKER ${index + 1}` : `SPECIAL ${index - mainCount + 1}`, exLevel: level[0], nsLevel: level[1], ssLevel: level[2], starLevel, uniqueWeaponLevel, gearLevel: parsed.gear[index] as 0 | 1 | 2 }
    })
    const lanes: StudentLane[] = slots.map(slot => ({ slotIndex: slot.index, student: slot.student, studentId: slot.student?.Id ?? null, label: slot.label, skills: [] }))
    for (const e of parsed.skills) {
      const lane = lanes[e.casterSlot]
      if (!lane?.student) throw new Error('施放槽位为空')
      const ref: SkillRef = e.skillRef
      const resolved = resolveSkill(lane.student, ref)
      if (!resolved) throw new Error(`学生 ${lane.student.Id} 的技能引用不存在`)
      const targets = e.targetSlots.map(slot => {
        if (slot === -1) return -1
        const target = lanes[slot]?.student
        if (!target) throw new Error('目标槽位为空或不存在')
        return target.Id
      })
      lanes[e.casterSlot].skills.push({ ...e, type: resolved.action.toLowerCase() as 'ex' | 'ns' | 'ss', name: resolved.name, startFrame: e.frame, studentId: lane.student.Id, targetIds: targets, targetId: targets[0] ?? lane.student.Id })
    }
    return { plan: { slots, lanes, env: { ...parsed.env, maxFrame: parsed.maxFrame ?? durationFrames(bosses, parsed.env.bossId, parsed.env.difficulty) }, deckOrder: parsed.deckOrder, nsScheduling: scheduling, warnings } }
  } catch (error) { return { error: error instanceof Error ? error.message : '导入结构非法' } }
}

export function exportPlanSnapshot(input: { lanes: StudentLane[]; slots: SquadSlot[]; deckOrder: number[] | null; env: BattleEnv; nsScheduling?: NsSchedulingConfig; pendingSuggestions?: number }) {
  if (input.pendingSuggestions) throw new Error('存在待确认 NS 建议，请先确认或移除再分享')
  const { lanes, slots, deckOrder, env } = input
  const sorted = [...lanes].sort((left, right) => left.slotIndex - right.slotIndex)
  const inputScheduling = input.nsScheduling ?? { enabled: false, ruleVersion: rules.nsScheduling.version, nsModes: [] }
  const nsScheduling = {
    ...inputScheduling,
    nsModes: sorted.map(lane => lane.student ? inputScheduling.nsModes[lane.slotIndex] ?? 'manual' : 'manual' as const),
  }
  return encodeShareCode(lanes, env.bossId, env.difficulty, env.armorType, env.terrain, deckOrder ?? undefined, slots, env.maxFrame, nsScheduling)
}
