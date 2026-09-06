import type { SimulationResult } from '../../engine/model/types'

/** Read-only clipping of actual execution records; never rebuild timings from intents. */
export function actionTrackSegments(result: Pick<SimulationResult, 'actionLogs' | 'maxFrame'> | null, slotIndex: number, totalFrames: number) {
  if (!result) return []
  const limit = Math.min(totalFrames, result.maxFrame)
  return result.actionLogs.filter(record => record.slotIndex === slotIndex && record.startFrame <= limit)
    .map(record => ({ ...record, endFrame: Math.min(record.endFrame, limit) }))
}

/** Waiting is not an executed action; retain the distinction in the visual projection. */
export function nsWaitingSegments(result: Pick<SimulationResult, 'nsScheduling' | 'maxFrame'> | null, slotIndex: number, totalFrames: number) {
  if (!result) return []
  const limit = Math.min(totalFrames, result.maxFrame)
  return result.nsScheduling.records.filter(record => record.slotIndex === slotIndex)
    .flatMap(record => record.waits.filter(wait => wait.startFrame < limit).map((wait, index) => ({
      ...wait, id: `${record.id}-wait-${index}`, studentId: record.studentId,
      triggerFrame: record.triggerFrame, castFrame: record.castFrame,
      endFrame: Math.min(wait.endFrame ?? limit, limit),
    })))
}
