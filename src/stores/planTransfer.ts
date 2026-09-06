import { useSquadStore } from './useSquadStore'
import { useTimelineStore } from './useTimelineStore'
import { useBossStore } from './useBossStore'
import { simulationTransaction } from './simulationTransaction'
import { useNsSchedulingStore } from './useNsSchedulingStore'
import { preparePlanImport } from '../utils/planTransfer'
import type { Student } from '../types/student'

export function importPlanIntoStores(decoded: { version: string; data: unknown }, students: ReadonlyMap<number, Student>) {
  const result = preparePlanImport(decoded, students, useBossStore.getState().bosses)
  if ('error' in result) return result
  const { plan } = result
  simulationTransaction(() => {
    const squad = useSquadStore.getState()
    squad.replaceAllSlots(plan.slots)
    squad.setDeckOrder(plan.deckOrder.length ? plan.deckOrder : null)
    const boss = useBossStore.getState()
    boss.selectBoss(plan.env.bossId)
    boss.selectDifficulty(plan.env.difficulty)
    boss.selectArmorType(plan.env.armorType as Parameters<typeof boss.selectArmorType>[0])
    boss.selectTerrain((['Street', 'Outdoor', 'Indoor'] as const)[plan.env.terrain])
    useTimelineStore.getState().setTotalFrames(plan.env.maxFrame)
    useTimelineStore.getState().replaceAllLanes(plan.lanes)
    useTimelineStore.getState().replaceSuggestions([])
    useNsSchedulingStore.getState().replaceConfig(plan.nsScheduling, plan.lanes.map(lane => lane.student?.Id ?? null))
  })
  return result
}
