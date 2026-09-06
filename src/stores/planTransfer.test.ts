import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { shareScenario } from '../engine/baseline/shareScenario'
import { exportPlanSnapshot } from '../utils/planTransfer'
import { decodeShareCode } from '../utils/shareCode'
import { scheduleNsBlocks } from '../utils/nsSchedule'
import { baselineLanes, baselineStudent } from '../engine/baseline/fixtures'
import { simulationTransaction, scheduleSimulation } from './simulationTransaction'

beforeAll(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined }))
afterAll(() => vi.unstubAllGlobals())

describe('transaction and suggestions', () => {
  it('coalesces nested transaction notifications into one request', () => {
    const run = vi.fn()
    simulationTransaction(() => { scheduleSimulation(run); simulationTransaction(() => scheduleSimulation(run)); scheduleSimulation(run) })
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('does not touch stores on invalid import, applies a valid plan completely', async () => {
    const { useTimelineStore } = await import('./useTimelineStore')
    const { useSquadStore } = await import('./useSquadStore')
    const { useBossStore } = await import('./useBossStore')
    const { useNsSchedulingStore } = await import('./useNsSchedulingStore')
    const { importPlanIntoStores } = await import('./planTransfer')
    const before = [useTimelineStore.getState(), useSquadStore.getState(), useBossStore.getState(), useNsSchedulingStore.getState()]
    const s = shareScenario()
    expect(importPlanIntoStores({ version: '4.0.0', data: null }, s.battle.students)).toHaveProperty('error')
    expect([useTimelineStore.getState(), useSquadStore.getState(), useBossStore.getState(), useNsSchedulingStore.getState()]).toEqual(before)
    const result = importPlanIntoStores(decodeShareCode(exportPlanSnapshot(s).code)!, s.battle.students)
    expect(result).toHaveProperty('plan')
    expect(useTimelineStore.getState().frameLimit).toBe(950)
    expect(useTimelineStore.getState().lanes[1].skills[0].targetSummonRefs).toHaveLength(1)
    expect(useBossStore.getState().selectedArmorType).toBe(s.env.armorType)
    expect(useSquadStore.getState().deckOrder).toEqual(s.deckOrder)
    expect(useNsSchedulingStore.getState().config).toEqual({ enabled: false, ruleVersion: 1, nsModes: ['manual', 'manual', 'manual'] })
  })
  it('requires explicit confirmation and does not repeat a confirmed suggestion', async () => {
    const { useTimelineStore } = await import('./useTimelineStore')
    const student = baselineStudent(10059)
    const lane = baselineLanes([student])[0]
    const input = { lane, student, rule: { kind: 'attack_count' as const, count: 5 }, totalFrames: 3000, gearLevel: 0 }
    const scheduled = scheduleNsBlocks(input)
    expect(scheduled.automatic).toEqual([])
    expect(scheduled.suggestions.length).toBeGreaterThan(0)
    useTimelineStore.getState().replaceAllLanes([lane])
    useTimelineStore.getState().replaceSuggestions(scheduled.suggestions)
    expect(useTimelineStore.getState().lanes[0].skills).toEqual([])
    const first = scheduled.suggestions[0]
    useTimelineStore.getState().confirmSuggestion(first.id, { startFrame: first.block.startFrame + 1 })
    const confirmed = useTimelineStore.getState().lanes[0]
    expect(confirmed.skills[0].trigger).toMatchObject({ source: 'manual', reasons: ['action_event'] })
    const repeated = scheduleNsBlocks({ ...input, lane: confirmed })
    expect(repeated.suggestions.some(s => s.id === first.id)).toBe(false)
    expect(confirmed.skills).toHaveLength(1)
  })
})
