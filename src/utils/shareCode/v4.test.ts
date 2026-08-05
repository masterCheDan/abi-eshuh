import { describe, expect, it } from 'vitest'
import { decode, encode } from './v4'
import type { StudentLane } from '../../types/timeline'

const lane = (id: number, slotIndex: number): StudentLane => ({ slotIndex, label: `S${slotIndex}`, studentId: id, student: { Id: id, Name: `S${id}`, Skills: { E: { Name: 'EX' } } } as StudentLane['student'], skills: [] })

describe('share code v4', () => {
  it('round-trips summon instance targets alongside normal targets', () => {
    const lanes = [lane(1, 0), lane(2, 1)]
    lanes[0]?.skills.push({
      type: 'ns', name: 'NS', startFrame: 90, studentId: 1, targetIds: [2], targetSummonIds: ['summon-spawn-40015-1'],
      skillRef: { kind: 'public' }, triggerSource: 'manual', trigger: { source: 'manual', reasons: ['external_state'] },
    })
    expect(decode(encode(lanes))?.skills[0]).toEqual(expect.objectContaining({
      targetSlots: [1], targetSummonIds: ['summon-spawn-40015-1'], skillRef: { kind: 'public' },
    }))
  })
})
