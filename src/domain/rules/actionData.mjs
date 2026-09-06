/**
 * Shared by the runtime facade and the coverage command. This is a data/readiness
 * inspection, NOT an attack scheduler. No animation formula is inferred here.
 */
const object = value => value != null && typeof value === 'object' && !Array.isArray(value)
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const nonnegative = value => Number.isFinite(value) && value >= 0
const integer = value => Number.isInteger(value) && value >= 0

export function validateActionCatalog(catalog) {
  const errors = []
  const issue = (path, message) => errors.push({ path: 'actions.' + path, message })
  const config = catalog.actions
  if (!object(config)) return [{ path: 'actions', message: 'Missing action data rules' }]
  if (config.version !== 1) issue('version', 'Unsupported action data rule version')
  if (config.pendingInterruption?.resolution !== 'preserve_unverified' || config.pendingInterruption?.status !== 'partial')
    issue('pendingInterruption', 'Unverified interruption fallback must remain explicit and partial')
  // The current binding only inspects data. Changing metadata cannot enable execution.
  if (config.policy?.status !== 'state_only' || config.policy?.handler !== 'action.inspect')
    issue('policy', 'Action data inspection cannot claim implemented execution')
  const contract = {
    ammoAmount: 'AmmoCost',
    attackCount: 'one_per_completed_action',
    hits: 'damage_weights_not_attack_count',
    appliedEffectsOnInterrupt: 'preserve',
    failedCast: 'no_action_mutation',
  }
  if (JSON.stringify(Object.keys(config.contract ?? {}).sort()) !== JSON.stringify(Object.keys(contract).sort()))
    issue('contract', 'Missing or unknown action contract field')
  for (const [key, value] of Object.entries(contract))
    if (config.contract?.[key] !== value) issue('contract.' + key, 'Unsupported action contract')
  const checkpoints = ['ammoDebit', 'attackComplete', 'reloadRefill', 'interruptResume', 'pendingEffectsOnInterrupt', 'frameComposition']
  for (const key of new Set([...checkpoints, ...Object.keys(config.checkpoints ?? {})]))
    if (!checkpoints.includes(key) || !nonempty(config.checkpoints?.[key]))
      issue('checkpoints.' + key, 'Missing limitation or unknown action checkpoint')
  for (const key of ['normalFields', 'requiredFrames', 'optionalFrames', 'effectFields', 'statModifierFields', 'statModifierStats', 'statModifierSources', 'overrideDamageTypes', 'radiusTypes']) {
    const values = config[key]
    if (!Array.isArray(values) || !values.length || values.some(value => !nonempty(value)) || new Set(values).size !== values.length)
      issue(key, 'Expected unique named data fields/values')
  }
  if (Array.isArray(config.requiredFrames) && Array.isArray(config.optionalFrames))
    for (const field of config.requiredFrames)
      if (config.optionalFrames.includes(field)) issue('optionalFrames', 'Frame cannot be both required and optional: ' + field)
  for (const category of ['stats', 'specials']) {
    if (!object(config.dependencies?.[category])) { issue('dependencies.' + category, 'Missing dependency rules'); continue }
    for (const [key, reason] of Object.entries(config.dependencies[category])) {
      if (!catalog.policies?.[category]?.[key]) issue('dependencies.' + category + '.' + key, 'Unregistered action dependency')
      if (!nonempty(reason)) issue('dependencies.' + category + '.' + key, 'Missing action dependency limitation')
    }
  }
  return errors
}

export function inspectActionData(student, catalog) {
  const diagnostics = validateActionCatalog(catalog).map(error => ({ ...error, severity: 'error', code: 'INVALID_ACTION_RULE' }))
  const config = catalog.actions
  const variants = []
  const add = (path, code, message, severity = 'blocker') => diagnostics.push({ path, code, message, severity })
  const root = String(student.Id) + ':N'
  const result = () => ({
    version: config?.version, studentId: student.Id, scope: 'student_data_only',
    automaticEligible: false, variants, diagnostics,
  })
  if (diagnostics.length) return result()
  if (!catalog.skills?.[student.Id]) add(root, 'UNREGISTERED_STUDENT', '学生没有显式规则登记', 'error')
  const normal = student.Skills?.N
  if (!normal) { add(root, 'NO_NORMAL_DATA', '没有学生普攻数据；不能用默认攻击循环补齐'); return result() }
  if (student.SquadType !== 'Main') add(root, 'NOT_MAIN_STUDENT', '后台学生不能直接使用前排普攻循环')
  for (const key of ['Ammo', 'AmmoCost'])
    if (!integer(student[key]) || student[key] === 0) add(student.Id + ':' + key, 'INVALID_AMMO', '弹药参数必须为正整数，不能用默认值替代', 'error')
  if (student.AmmoCost > student.Ammo) add(root, 'INSUFFICIENT_MAGAZINE', '单次弹药需求超过弹匣，缺少适用规则')
  for (const [key, message] of Object.entries(config.checkpoints)) add(root, 'UNVERIFIED_' + key, message)
  add(root, 'ACTION_RUNTIME_PENDING', config.policy.limitations)

  function fields(value, allowed, path) {
    for (const key of Object.keys(value))
      if (!allowed.includes(key)) add(path + '.' + key, 'UNKNOWN_ACTION_FIELD', '未登记的普攻数据字段', 'error')
  }
  function numbers(value, path) {
    if (!Array.isArray(value) || !value.length || value.some(n => !nonnegative(n)))
      add(path, 'INVALID_ACTION_VALUE', '需要非空非负数值数组', 'error')
  }
  function walk(node, path) {
    if (!object(node)) { add(path, 'INVALID_NORMAL', '普攻分支必须是对象', 'error'); return }
    fields(node, config.normalFields, path)
    variants.push({ path, ammoCapacity: student.Ammo, ammoCost: student.AmmoCost })
    if (!object(node.Frames)) add(path + '.Frames', 'MISSING_FRAMES', '缺失普攻帧数据', 'error')
    else {
      fields(node.Frames, [...config.requiredFrames, ...config.optionalFrames], path + '.Frames')
      for (const key of new Set([...config.requiredFrames, ...Object.keys(node.Frames)]))
        if (!integer(node.Frames[key])) add(path + '.Frames.' + key, 'INVALID_FRAME', '帧时长必须为非负整数', 'error')
      if (Object.values(node.Frames).every(n => n === 0)) add(path + '.Frames', 'ZERO_CYCLE', '全零时长不能驱动动作循环')
    }
    if (!Array.isArray(node.Effects)) add(path + '.Effects', 'MISSING_NORMAL_EFFECTS', '旧数据缺少普攻效果，需重新加载学生数据', 'error')
    else {
      if (!node.Effects.length) add(path + '.Effects', 'EMPTY_NORMAL_EFFECTS', '空普攻效果不能认证攻击完成')
      for (const [index, effect] of node.Effects.entries()) {
        const ep = path + '.Effects[' + index + ']'
        if (!object(effect)) { add(ep, 'INVALID_EFFECT', '效果必须是对象', 'error'); continue }
        fields(effect, config.effectFields, ep)
        for (const key of ['Hits', 'Scale', 'IgnoreDef']) if (effect[key] != null) numbers(effect[key], ep + '.' + key)
        for (const key of ['AdditionalDamage', 'ExcludeDesc'])
          if (effect[key] != null && typeof effect[key] !== 'boolean') add(ep + '.' + key, 'INVALID_ACTION_VALUE', '需要布尔值', 'error')
        if (effect.OverrideSkillDamageType != null && !config.overrideDamageTypes.includes(effect.OverrideSkillDamageType))
          add(ep + '.OverrideSkillDamageType', 'UNKNOWN_DAMAGE_TYPE', '未登记的伤害类型替换', 'error')
        if (effect.Condition != null) add(ep + '.Condition', 'CONDITIONAL_NORMAL', '普攻条件分支尚未绑定到动作执行')
        if (effect.StatModifier != null) {
          const modifier = effect.StatModifier
          add(ep + '.StatModifier', 'NORMAL_STAT_MODIFIER', '保留属性倍率来源，但尚未执行普攻数值修正')
          if (!object(modifier)) { add(ep + '.StatModifier', 'INVALID_MODIFIER', '属性修正必须是对象', 'error'); continue }
          fields(modifier, config.statModifierFields, ep + '.StatModifier')
          for (const [key, options] of [['Stat', config.statModifierStats], ['Source', config.statModifierSources]])
            if (!options.includes(modifier[key])) add(ep + '.StatModifier.' + key, 'UNKNOWN_MODIFIER', '未登记的属性修正来源', 'error')
          for (const key of ['MinStatValue', 'MaxStatValue', 'MultiplierMin', 'MultiplierMax'])
            if (!nonnegative(modifier[key])) add(ep + '.StatModifier.' + key, 'INVALID_MODIFIER', '需要非负数值', 'error')
          if (modifier.MinStatValue > modifier.MaxStatValue) add(ep + '.StatModifier', 'INVALID_MODIFIER', '属性区间上下限颠倒', 'error')
        }
      }
    }
    if (node.FixedFrameRate != null) {
      if (!Number.isFinite(node.FixedFrameRate) || node.FixedFrameRate <= 0) add(path + '.FixedFrameRate', 'INVALID_FIXED_RATE', '固定帧率值必须为正数', 'error')
      add(path + '.FixedFrameRate', 'FIXED_FRAME_RATE', '固定帧率与攻速修正的优先级尚未执行')
    }
    if (node.Radius != null) {
      if (!Array.isArray(node.Radius)) add(path + '.Radius', 'INVALID_RADIUS', '范围必须是数组', 'error')
      else for (const [index, radius] of node.Radius.entries()) {
        const rp = path + '.Radius[' + index + ']'
        if (!object(radius)) { add(rp, 'INVALID_RADIUS', '范围必须是对象', 'error'); continue }
        fields(radius, ['Type', 'Radius', 'Degree', 'Width', 'Height'], rp)
        if (!config.radiusTypes.includes(radius.Type)) add(rp + '.Type', 'UNKNOWN_RADIUS', '未登记的普攻范围类型', 'error')
        const required = radius.Type === 'Obb' ? ['Width', 'Height'] : radius.Type === 'Fan' ? ['Radius', 'Degree'] : ['Radius']
        for (const key of new Set([...required, ...Object.keys(radius).filter(key => key !== 'Type')]))
          if (!nonnegative(radius[key])) add(rp + '.' + key, 'INVALID_RADIUS', '范围参数必须为非负数值', 'error')
      }
    }
    if (node.FormChange != null) {
      add(path + '.FormChange', 'NORMAL_REPLACEMENT', '保留替换普攻，但缺少与形态切换、弹药和中断状态的绑定')
      walk(node.FormChange, path + '.FormChange')
    }
  }
  walk(normal, root)
  function dependencies(skill, path, effectField = 'Effects') {
    if (!object(skill)) return
    for (const [index, effect] of (Array.isArray(skill[effectField]) ? skill[effectField] : []).entries()) {
      if (!object(effect)) continue
      const ep = path + '.' + effectField + '[' + index + ']'
      const statReason = config.dependencies.stats[effect.Stat]
      if (statReason) add(ep + '.Stat', 'ACTION_MODIFIER', statReason)
      if (effect.Type === 'Special') add(ep + '.Key', 'SPECIAL_DEPENDENCY',
        config.dependencies.specials[effect.Key] ?? '特殊状态对动作的影响未经认证，不能默认无影响')
      if (effect.Type === 'CrowdControl' || effect.Type === 'Knockback')
        add(ep, 'CONTROL_DEPENDENCY', '控制与动作中断尚未接入共同执行状态')
    }
    for (const [index, extra] of (Array.isArray(skill.ExtraSkills) ? skill.ExtraSkills : []).entries())
      dependencies(extra, path + '.ExtraSkills[' + index + ']')
  }
  for (const [kind, skill] of Object.entries(student.Skills ?? {})) if (kind !== 'N') dependencies(skill, student.Id + ':' + kind)
  const openingPublic = catalog.opening?.public?.[student.Id]
  if (openingPublic) dependencies(openingPublic, student.Id + ':' + (openingPublic.kind === 'gear_public' ? 'G' : 'P'), 'syntheticEffects')
  const openingEp = catalog.opening?.overrides?.[student.Id]
  if (openingEp) dependencies(openingEp, student.Id + ':EP', 'syntheticEffects')
  return result()
}
