import type { Formation, StudentRuntimeState } from '../model/types'
import type { CardOrderSystem } from '../system/cardOrderSystem'
import type { StudentEffectSystem } from '../system/studentEffectSystem'
import type { CostSystem } from './CostSystem'
import type { ActionSystem } from '../system/ActionSystem'
import type { NsScheduler } from '../system/NsScheduler'

/**
 * 组合式战斗状态根容器。
 *
 * 各子系统（卡序/效果/Cost）仍持有自己的内部状态，容器只做组合，
 * 供 SimulationEngine 以单一对象读取/编排，避免散落临时变量。
 */
export interface BattleState {
  frame: number
  formation: Formation
  runtimes: Map<number, StudentRuntimeState>
  cards: CardOrderSystem
  effects: StudentEffectSystem
  cost: CostSystem
  actions: ActionSystem
  nsScheduler: NsScheduler
}
