import { describe, expect, it } from 'vitest'
import { decode, encode } from './v3'
import type { StudentLane } from '../../types/timeline'

const lane = (id: number, slotIndex: number): StudentLane => ({ slotIndex, label: `S${slotIndex}`, studentId: id, student: { Id: id, Name: `S${id}`, Skills: { E: { Name: 'EX' } } } as StudentLane['student'], skills: [] })
describe('share code v3', () => {
  it('round-trips user trigger evidence and condition end frame', () => {
    const lanes = [lane(1, 0), lane(2, 1)]
    lanes[0]?.skills.push({ type: 'ns', name: 'NS', startFrame: 90, studentId: 1, targetIds: [2], skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['chance', 'hp_threshold'], conditionEndFrame: 210 } })
    expect(decode(encode(lanes))?.skills[0]).toEqual({ frame: 90, casterSlot: 0, targetSlots: [1], skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['chance', 'hp_threshold'], conditionEndFrame: 210 } })
  })

  it('round-trips optional star and unique weapon ranks', () => {
    const lanes = [lane(1, 0), lane(2, 1)]
    const slots = [
      { index: 0, starLevel: 5, uniqueWeaponLevel: 4 },
      { index: 1, starLevel: 4, uniqueWeaponLevel: 0 },
    ] as Parameters<typeof encode>[6]
    expect(decode(encode(lanes, 0, 5, 'LightArmor', 0, undefined, slots))?.ranks)
      .toEqual([[5, 4], [4, 0]])
  })

  it('migrates older v3 payloads without ranks', () => {
    const lanes = [lane(1, 0)]
    expect(decode(encode(lanes))?.ranks).toEqual([null])
  })
})
