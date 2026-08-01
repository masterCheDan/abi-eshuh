import type { EffectAuditRecord } from '../model/types'

export type CostChangeValueType = NonNullable<EffectAuditRecord['valueType']>

export interface CostModifier {
  amount: number
  valueType: CostChangeValueType
}

export function normalizeCostChangeValueType(valueType: string | undefined): CostChangeValueType {
  return valueType === 'Coefficient' ? 'Coefficient' : 'BaseAmount'
}

/**
 * Blue Archive truncates the reduction amount, not the resulting cost:
 * 5 Cost with -50% reduces by floor(2.5), resulting in 3 Cost.
 */
export function applyCostModifier(baseCost: number, modifier: CostModifier | null): number {
  if (!modifier) return Math.max(0, baseCost)
  const delta = modifier.valueType === 'Coefficient'
    ? Math.trunc(baseCost * modifier.amount / 10_000)
    : modifier.amount
  return Math.max(0, baseCost + delta)
}

/**
 * Reconstructs the CostChange that is active immediately before intents at a frame.
 * A modifier consumed by an EX on that frame still applies to that EX.
 */
export function costModifierAtFrame(
  records: EffectAuditRecord[],
  studentId: number,
  frame: number,
): CostModifier | null {
  const active = new Map<number, EffectAuditRecord>()

  for (const record of records) {
    if (record.frame > frame || record.effectType !== 'CostChange' || record.effectId == null) continue
    if (record.action === 'applied' && record.targetIds.includes(studentId)) {
      active.set(record.effectId, record)
      continue
    }
    const removesBeforeIntent = record.frame < frame || record.action !== 'consumed'
    if (removesBeforeIntent && ['expired', 'consumed', 'replaced', 'dispelled'].includes(record.action)) {
      active.delete(record.effectId)
    }
  }

  const latest = [...active.values()].at(-1)
  if (!latest) return null
  return {
    amount: latest.value ?? 0,
    valueType: normalizeCostChangeValueType(latest.valueType),
  }
}

export function effectiveCostAtFrame(
  records: EffectAuditRecord[],
  studentId: number,
  frame: number,
  baseCost: number,
): number {
  return applyCostModifier(baseCost, costModifierAtFrame(records, studentId, frame))
}
