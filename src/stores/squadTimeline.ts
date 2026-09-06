/**
 * squad ↔ timeline 编排层
 *
 * 唯一知道「squad 槽位配置」与「时间轴轨道」同步关系的地方。
 * useSquadStore / useTimelineStore 各自保持纯单职责，不互相调用；
 * 所有需要同时修改两者的组合操作统一集中在这里。
 */

import { useSquadStore, loadSnapshot } from './useSquadStore'
import { useTimelineStore } from './useTimelineStore'
import { useNsSchedulingStore } from './useNsSchedulingStore'
import type { SquadMode } from '../types/squad'
import type { Student } from '../types/student'

/** 切换队伍模式：同时重置 squad 槽位与时间轴轨道。 */
export function setMode(mode: SquadMode): void {
  useSquadStore.getState().setModeConfig(mode)
  useTimelineStore.getState().initLanes(mode)
  useNsSchedulingStore.getState().resize(useSquadStore.getState().config.slots.map(slot => slot.student?.Id ?? null))
}

/** 分配学生到指定位置：同时写入 squad 槽位与时间轴轨道。 */
export function assignStudent(slotIndex: number, student: Student): void {
  useSquadStore.getState().assignSlotConfig(slotIndex, student)
  useTimelineStore.getState().assignSlot(slotIndex, student)
  // A mode belongs to a configured student, not a physical slot reused by another student.
  useNsSchedulingStore.getState().clearSlot(slotIndex)
}

/** 从位置移除学生：同时清空 squad 槽位与时间轴轨道（含技能）。 */
export function removeStudent(slotIndex: number): void {
  useSquadStore.getState().removeSlotConfig(slotIndex)
  useTimelineStore.getState().unassignSlot(slotIndex)
  useNsSchedulingStore.getState().clearSlot(slotIndex)
}

/** 从 localStorage 恢复编队（需在 students 加载后调用）。 */
export function restoreFromStorage(getStudent: (id: number) => Student | null): void {
  const snap = loadSnapshot()
  if (!snap) return

  const squad = () => useSquadStore.getState()
  if (snap.mode !== squad().config.mode) {
    setMode(snap.mode)
  }

  for (const { index, studentId, exLevel, nsLevel, ssLevel, starLevel, uniqueWeaponLevel, gearLevel } of snap.slots) {
    const student = getStudent(studentId)
    if (!student) continue
    assignStudent(index, student)
    squad().setSkillLevel(index, 'ex', exLevel ?? 5)
    squad().setSkillLevel(index, 'ns', nsLevel ?? 10)
    squad().setSkillLevel(index, 'ss', ssLevel ?? 10)
    squad().setStarLevel(index, starLevel ?? student.StarGrade)
    squad().setUniqueWeaponLevel(index, uniqueWeaponLevel ?? 0)
    squad().setGearLevel(index, gearLevel ?? 1)
  }
}
