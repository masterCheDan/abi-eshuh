import { describe, expect, it } from 'vitest'
import { decode, encode } from './v2'
import type { StudentLane } from '../../types/timeline'

const lane = (id: number, slotIndex: number): StudentLane => ({
  slotIndex, label: `S${slotIndex}`, studentId: id,
  student: { Id: id, Name: `S${id}`, Skills: { E: { Name: 'EX' } } } as StudentLane['student'],
  skills: [],
})

describe('share code v2', () => {
  it('round-trips manual multi-target and non-EX student events', () => {
    const lanes = [lane(1, 0), lane(2, 1), lane(3, 2)]
    lanes[0]?.skills.push({ type: 'ns', name: 'NS', startFrame: 90, studentId: 1, targetIds: [2, 3], skillRef: { kind: 'public' }, triggerSource: 'manual' })
    const decoded = decode(encode(lanes))
    expect(decoded?.skills).toEqual([{ frame: 90, casterSlot: 0, targetSlots: [1, 2], skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual' } }])
  })
})
