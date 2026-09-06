/**
 * 独立 Cost 领域组件：管理可用 Cost、帧回复、支付与历史曲线。
 * 对效果状态的依赖（RegenCost/CostChange/CostOverload）由调用方以只读方式传入。
 */
export class CostSystem {
  private available: number
  private readonly history: number[] = []
  private readonly maxCost: number

  constructor(
    maxCost: number,
    initialCost: number,
  ) {
    this.maxCost = maxCost
    this.available = Math.min(maxCost, Math.max(0, initialCost))
  }

  get availableCost(): number {
    return this.available
  }

  get costHistory(): readonly number[] {
    return this.history
  }

  /** 每帧回复（含效果加成）。 */
  advance(frameRegen: number): void {
    this.available = Math.min(this.maxCost, this.available + frameRegen)
  }

  canPay(cost: number, borrowLimit: number): boolean {
    return !(cost > 0 && this.available < cost && this.available - cost < -borrowLimit)
  }

  pay(cost: number): void {
    this.available -= cost
  }

  /** 帧末记录曲线。 */
  recordFrame(): void {
    this.history.push(this.available)
  }
}
