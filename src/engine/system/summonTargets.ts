import type { EffectAuditRecord, SummonInstance } from '../model/types'

/** 从审计流重建指定帧仍可作为目标的召唤物。 */
export function activeSummonsAtFrame(audit: EffectAuditRecord[] | undefined, frame: number): SummonInstance[] {
  if (!audit) return []
  const active = new Map<string, SummonInstance>()
  for (const record of audit) {
    if (record.frame > frame || !record.summon) continue
    const { summon } = record
    if (record.action === 'applied') {
      active.set(summon.instanceId, { ...summon, sourceEventId: '', sourceSkillRef: record.skillRef, stats: {}, active: true })
    } else if (record.action === 'expired' || record.action === 'replaced') {
      active.delete(summon.instanceId)
    }
  }
  return [...active.values()].sort((left, right) => left.spawnFrame - right.spawnFrame || left.instanceId.localeCompare(right.instanceId))
}

export function summonTargetLabel(summon: Pick<SummonInstance, 'summonId' | 'kind' | 'ownerId'>): string {
  const kind = summon.kind === 'vehicle' ? '载具' : summon.kind === 'cover' ? '掩体' : '召唤物'
  return `${kind} #${summon.summonId}（学生 ${summon.ownerId}）`
}
