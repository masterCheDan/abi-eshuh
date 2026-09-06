import { EffectExecutor } from './EffectExecutor'
import { EffectScheduler } from './EffectScheduler'
import { SkillValidator } from './SkillValidator'
import { applyCostModifier } from './costModifier'
import { triggerSpecsFor } from '../../domain/rules/ruleManifest'
import { automaticTriggerSpecs } from '../../domain/rules/triggerSpecs'
import { scheduleNsBlocks } from '../../utils/nsSchedule'
import { inspectStudentActionData } from '../../domain/rules/actionRules'
import { NsScheduler } from './NsScheduler'

/** Real function references, not a second list claiming semantic completeness. */
export function runtimeRuleBindings(): Record<string, unknown> {
  return {
    ...EffectExecutor.ruleBindings(),
    ...EffectScheduler.ruleBindings(),
    ...SkillValidator.ruleBindings(),
    ...NsScheduler.ruleBindings(),
    'cost.modify': applyCostModifier,
    'trigger.manual': triggerSpecsFor,
    'trigger.opening': automaticTriggerSpecs,
    'trigger.ns': scheduleNsBlocks,
    'action.inspect': inspectStudentActionData,
  }
}
