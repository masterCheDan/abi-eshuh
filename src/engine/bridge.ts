/**
 * Engine ↔ Store 桥接层
 *
 * 职责：
 *   1. 将 Zustand Store 中的 SkillBlock[] + Student[] 转换为 Intent[]
 *   2. 构建 Formation / BattleEnv 供 Engine.loadBattle() 使用
 *   3. 将 Engine 产出的 SimulationResult 转为可用的 ViewModel
 */

import type { StudentLane } from '../types/timeline'
import type { Student } from '../types/student'
import type { SlotLevels } from '../types/squad'
import type { Intent, BattleEnv, Formation, SkillRef } from '../engine/model/types'
import { PRIORITY } from '../engine/model/fsm'
import { SimulationEngine } from '../engine/core/simulationEngine'
import { normalizeTrigger } from '../domain/triggerEvidence'

// ═══════════════════════════════════════════════════
// 1. Store → Engine Input
// ═══════════════════════════════════════════════════

/** 将时间轴事实 → Engine Intent（EX/NS/SS 均可手动录入）。 */
export function lanesToIntents(lanes: StudentLane[], slotLevels: ReadonlyArray<SlotLevels>): Intent[] {
  const intents: Intent[] = []
  let idCounter = 0

  for (const lane of lanes) {
    if (!lane.student) continue
    for (const skill of lane.skills) {
      const evidence = normalizeTrigger(skill)
      const gearLevel = slotLevels[lane.slotIndex]?.gearLevel ?? 1
      const skillRef = skill.skillRef ?? inferSkillRef(skill.type, lane.student, gearLevel)
      intents.push({
        id: skill.eventId ?? `skill-${idCounter++}`,
        frame: skill.startFrame,
        type: skillRef.kind === 'ex' || skillRef.kind === 'extra_ex' ? 'EX_CAST' : skillRef.kind === 'extra_passive' || skillRef.kind === 'passive' || skillRef.kind === 'weapon_passive' ? 'SS_TRIGGER' : 'NS_TRIGGER',
        issuerId: skill.studentId,
        targetIds: skill.targetIds ?? [skill.targetId ?? skill.studentId],
        targetSummonIds: skill.targetSummonIds,
        targetSummonRefs: skill.targetSummonRefs,
        priority: skillRef.kind === 'ex' || skillRef.kind === 'extra_ex' ? PRIORITY.EX_CAST : skillRef.kind === 'public' || skillRef.kind === 'gear_public' ? PRIORITY.NS_TRIGGER : PRIORITY.SS_TRIGGER,
        skillRef,
        ...('error' in evidence ? { triggerSource: skill.triggerSource, trigger: skill.trigger } : evidence),
      })
    }
  }

  return intents
}

function inferSkillRef(type: StudentLane['skills'][number]['type'], student: Student, gearLevel: number): SkillRef {
  if (type === 'ex') return { kind: 'ex' }
  if (type === 'ns') return gearLevel > 0 && student.Skills.G ? { kind: 'gear_public' } : { kind: 'public' }
  return { kind: 'extra_passive' }
}

/** 构建 Formation 供 Engine 使用 */
export function buildFormation(
  lanes: StudentLane[],
  /** 用户设置的初始牌序 (slotIndex 数组), 无则传入 null */
  deckOrder: number[] | null | undefined,
  /** 每槽位技能等级/养成配置（index 与 slotIndex 对齐）。 */
  slotLevels: ReadonlyArray<SlotLevels>,
): Formation {
  const sorted = [...lanes].sort((a, b) => a.slotIndex - b.slotIndex)

  return {
    mode: sorted.length > 6 ? 'total_assault' : 'normal',
    slots: sorted.map(l => l.student?.Id ?? null),
    deckOrder: deckOrder && deckOrder.length > 0 ? deckOrder : undefined,
    skillLevels: sorted.map(l => slotLevels[l.slotIndex]?.exLevel ?? 5),
    publicSkillLevels: sorted.map(l => slotLevels[l.slotIndex]?.nsLevel ?? 10),
    passiveSkillLevels: sorted.map(l => slotLevels[l.slotIndex]?.ssLevel ?? 10),
    starLevels: sorted.map(l => slotLevels[l.slotIndex]?.starLevel ?? l.student?.StarGrade ?? 0),
    uniqueWeaponLevels: sorted.map(l => slotLevels[l.slotIndex]?.uniqueWeaponLevel ?? 0),
    gearLevels: sorted.map(l => slotLevels[l.slotIndex]?.gearLevel ?? 1),
  }
}

/** 构建 BattleEnv */
export function buildBattleEnv(
  bossId = 0,
  difficulty = 5,
  armorType = 'LightArmor',
  terrain = 0,
  maxFrame = 5400,
): BattleEnv {
  return { bossId, difficulty, armorType, terrain, maxFrame }
}

// ═══════════════════════════════════════════════════
// 2. Engine 运行
// ═══════════════════════════════════════════════════

/** 一键运行所需的完整纯输入。 */
export interface RunSimulationInput {
  nsScheduling?: import('./model/types').NsSchedulingConfig
  maxFrame?: number
  lanes: StudentLane[]
  students: Map<number, Student>
  /** 每槽位技能等级/养成配置（index 与 slotIndex 对齐）。 */
  slotLevels: ReadonlyArray<SlotLevels>
  /** 用户设置的初始牌序 (slotIndex 数组)。 */
  deckOrder?: number[] | null
  bossId?: number
  difficulty?: number
  armorType?: string
  terrain?: number
}

/**
 * 一键运行：Store lanes → Engine.simulate() → SimulationResult
 *
 * 纯函数：所有输入（含槽位配置）由调用方显式传入，不再读取任何 store。
 */
export function runSimulation(input: RunSimulationInput) {
  const {
    lanes,
    students,
    slotLevels,
    deckOrder = null,
    bossId = 0,
    difficulty = 5,
    armorType = 'LightArmor',
    terrain = 0,
    maxFrame = 5400,
  } = input

  const engine = new SimulationEngine()
  const env = buildBattleEnv(bossId, difficulty, armorType, terrain, maxFrame)
  const formation = buildFormation(lanes, deckOrder, slotLevels)

  engine.loadBattle(env, formation, students)

  const intents = lanesToIntents(lanes, slotLevels)
  return engine.simulate(intents, input.nsScheduling)
}

// ═══════════════════════════════════════════════════
// 3. SimulationResult → ViewModel 映射
// ═══════════════════════════════════════════════════

/** UI 时间轴块（含渲染属性） */
export interface UiTimelineBlock {
  recordId: string
  studentId: number
  slotIndex: number
  actionType: string
  startFrame: number
  endFrame: number
  uiColor: string
  isVisuallyCut: boolean
}

/** 将 SimulationResult.actionLogs 映射为 UI 可用块 */
export function mapToUiBlocks(result: {
  actionLogs: { recordId: string; studentId: number; slotIndex: number; actionType: string; startFrame: number; endFrame: number; wasInterrupted: boolean }[]
}): UiTimelineBlock[] {
  const colors: Record<string, string> = {
    EX: '#3b82f6',
    NS: '#10b981',
    SS: '#f59e0b',
    AA: '#6b7280',
    RELOAD: '#f97316',
    CC: '#ef4444',
  }

  return result.actionLogs.map(log => ({
    recordId: log.recordId,
    studentId: log.studentId,
    slotIndex: log.slotIndex,
    actionType: log.actionType,
    startFrame: log.startFrame,
    endFrame: log.endFrame,
    uiColor: colors[log.actionType] ?? '#888',
    isVisuallyCut: log.wasInterrupted,
  }))
}
