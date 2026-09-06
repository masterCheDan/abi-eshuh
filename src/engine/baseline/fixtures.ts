import data from '../../data/students.min.json'
import type { Student } from '../../types/student'
import type { SquadSlot } from '../../types/squad'
import type { StudentLane } from '../../types/timeline'
import type { BattleEnv, Formation, Intent } from '../model/types'

/** Only the data shape is reused; synthetic IDs avoid student-specific rule branches. */
export function baselineStudent(id: number): Student {
  const unit = structuredClone(data['10000']) as unknown as Student
  unit.Id = id
  unit.Name = `Baseline ${id}`
  unit.SquadType = 'Main'
  unit.Regen = 700
  unit.HasGear = false
  unit.Summons = []
  unit.Skills.E = {
    Name: 'Baseline EX', Desc: '', Parameters: [], Cost: [3, 3, 3, 3, 3],
    Duration: 60, Range: 0, Icon: '',
    Effects: [{ Type: 'Shield', Target: 'Self', Scale: [100], Duration: 1_000 }],
  }
  unit.Skills.P = { Name: 'Baseline NS', Desc: '', Parameters: [], Duration: 1, Range: 0, Icon: '', Effects: [] }
  unit.Skills.G = structuredClone(unit.Skills.P)
  for (const kind of ['PS', 'WP', 'EP'] as const) {
    unit.Skills[kind] = { Name: kind, Desc: '', Parameters: [], Icon: '', Effects: [] }
  }
  return unit
}

export function baselineBattle(count = 3) {
  const students = Array.from({ length: count }, (_, index) => baselineStudent(900001 + index))
  const formation: Formation = { mode: 'normal', slots: students.map(unit => unit.Id), deckOrder: students.map((_, index) => index) }
  const env: BattleEnv = { bossId: 0, difficulty: 5, armorType: 'LightArmor', terrain: 0, maxFrame: 950 }
  return { students: new Map(students.map(unit => [unit.Id, unit])), formation, env }
}

export function baselineEx(id: string, frame: number, issuerId = 900001): Intent {
  return { id, frame, issuerId, type: 'EX_CAST', targetIds: [issuerId], priority: 1, skillRef: { kind: 'ex' }, triggerSource: 'manual', trigger: { source: 'manual' } }
}

export function baselineLanes(students: Student[]): StudentLane[] {
  return students.map((student, slotIndex) => ({ slotIndex, label: `L${slotIndex}`, student, studentId: student.Id, skills: [] }))
}

export function baselineSlots(lanes: StudentLane[]): SquadSlot[] {
  return lanes.map(lane => ({ index: lane.slotIndex, slotType: lane.student?.SquadType ?? 'Main', label: lane.label, student: lane.student, locked: true, exLevel: 5, nsLevel: 10, ssLevel: 10, starLevel: 5, uniqueWeaponLevel: 0, gearLevel: 0 }))
}
