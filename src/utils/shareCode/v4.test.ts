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
      targetSlots: [1],
      targetSummonRefs: [{ sourceEventId: 'spawn', summonId: 40015, spawnIndex: 1 }],
      skillRef: { kind: 'public' },
    }))
  })

  it('round-trips gear levels and defaults missing gear to 1', () => {
    const lanes = [lane(1, 0), lane(2, 1)]
    const squadSlots = [
      { index: 0, gearLevel: 0, starLevel: 3, uniqueWeaponLevel: 0 },
      { index: 1, gearLevel: 2, starLevel: 3, uniqueWeaponLevel: 0 },
    ] as unknown as import('../../types/squad').SquadSlot[]
    const encoded = encode(lanes, 0, 5, 'LightArmor', 0, undefined, squadSlots)
    expect(decode(encoded)?.gear).toEqual([0, 2])
    const legacy = JSON.parse(encoded) as Record<string, unknown>
    delete legacy.gear
    expect(decode(JSON.stringify(legacy))?.gear).toEqual([1, 1])
  })

  it('preserves same-frame insertion order instead of sorting by event ID', () => {
    const lanes = [lane(1, 0)]
    for (const eventId of ['z-first', 'a-second']) lanes[0].skills.push({ eventId, type: 'ex', name: 'EX', startFrame: 100, studentId: 1, targetIds: [-1] })
    expect(decode(encode(lanes))?.skills.map(skill => skill.eventId)).toEqual(['z-first', 'a-second'])
  })

  it.each(['empty caster', 'unknown target', 'invalid source', 'conflicting source'])('rejects %s in the codec rather than passing null to import preparation', kind => {
    const lanes = [lane(1, 0)]
    lanes[0].skills.push({ type: 'ex', name: 'EX', startFrame: 100, studentId: 1, targetIds: [-1], trigger: { source: 'manual' } })
    const raw = JSON.parse(encode(lanes))
    if (kind === 'empty caster') { raw.form[0] = null; raw.levels[0] = null }
    if (kind === 'unknown target') raw.events[0].targetSlots = [9]
    // B03: both invalid aliases and a conflicting valid alias must be rejected.
    if (kind === 'invalid source') raw.events[0].triggerSource = 'invalid'
    if (kind === 'conflicting source') raw.events[0].triggerSource = 'automatic'
    expect(decode(JSON.stringify(raw))).toBeNull()
  })
})
