import { useTimelineStore } from './useTimelineStore'
import { useSquadStore } from './useSquadStore'
import { useBossStore } from './useBossStore'
import { durationFrames } from '../utils/planTransfer'
import { alignNsScheduling, useNsSchedulingStore } from './useNsSchedulingStore'

export function currentPlanSnapshot() {
  const timeline = useTimelineStore.getState(), squad = useSquadStore.getState(), boss = useBossStore.getState()
  return { lanes: timeline.lanes, slots: squad.config.slots, deckOrder: squad.deckOrder, pendingSuggestions: timeline.suggestions.length,
    nsScheduling: alignNsScheduling(useNsSchedulingStore.getState().config, timeline.lanes.map(lane => lane.student?.Id ?? null)),
    env: { bossId: boss.selectedBossId, difficulty: boss.selectedDifficulty, armorType: boss.selectedArmorType, terrain: ['Street', 'Outdoor', 'Indoor'].indexOf(boss.selectedTerrain), maxFrame: timeline.frameLimit ?? durationFrames(boss.bosses, boss.selectedBossId, boss.selectedDifficulty) } }
}
