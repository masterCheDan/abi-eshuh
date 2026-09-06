/** Shared runtime/coverage gate for explicitly reviewed NS effects. No description parsing. */
export function inspectNsScheduling(student, gearLevel, catalog) {
  const path = gearLevel > 0 && student.Skills.G ? 'G' : 'P'
  const skillRef = { kind: path === 'G' ? 'gear_public' : 'public' }
  const skill = student.Skills[path]
  const reasons = []
  const trigger = catalog.ns?.[student.Id]
  const manualReason = catalog.nsScheduling?.manualOnly?.[student.Id]?.[path]
  const reviewed = catalog.nsScheduling?.skills?.[student.Id]?.[path]
  if (manualReason) reasons.push(manualReason)
  if (trigger?.kind === 'attack_count') reasons.push('攻击次数 NS 需要可信普攻完成记录，当前保留待确认建议')
  if (!reviewed) reasons.push('该学生当前 NS 尚无经过逐技能审查的自动执行登记')
  if (!skill || !trigger || trigger.kind !== 'interval' || !catalog.skills?.[student.Id]?.[path]?.includes('ns.interval')) reasons.push('缺少匹配的周期触发规则')
  const periodFrames = (trigger?.seconds ?? 0) * 30
  if (!Number.isInteger(periodFrames) || periodFrames <= 0) reasons.push('周期帧数必须为正整数')
  if (skill && reviewed) {
    const allowedSkillFields = ['Name', 'Desc', 'Parameters', 'Duration', 'Range', 'Radius', 'Icon', 'Effects']
    if (Object.keys(skill).some(key => !allowedSkillFields.includes(key))) reasons.push('技能包含未审查的分支或额外字段，需要重新登记')
    if (!Number.isInteger(skill.Duration) || skill.Duration <= 0) reasons.push('技能动作时长缺少明确正整数帧数据')
    const allowedFields = ['Type', 'Stat', 'Target', 'Value', 'Channel', 'Duration', 'ApplyFrame']
    if (!Array.isArray(reviewed.stats) || !reviewed.stats.length
      || !Array.isArray(skill.Effects) || skill.Effects.length !== reviewed.stats.length || skill.Effects.some((effect, index) => {
        if (!effect || typeof effect !== 'object') return true
        const targets = Array.isArray(effect.Target) ? effect.Target : [effect.Target]
        return effect.Type !== 'Buff' || effect.Stat !== reviewed.stats[index]
          || !catalog.policies?.stats?.[effect.Stat] || Object.keys(effect).some(key => !allowedFields.includes(key))
          || targets.length !== 1 || targets[0] !== 'Self'
          || !Number.isInteger(effect.ApplyFrame) || effect.ApplyFrame < 0 || effect.ApplyFrame > skill.Duration
          || !Number.isFinite(effect.Duration) || effect.Duration <= 0
          || !Number.isInteger(effect.Channel) || !Array.isArray(effect.Value) || effect.Value.length !== 1
          || !Array.isArray(effect.Value[0]) || effect.Value[0].length !== 10 || effect.Value[0].some(value => !Number.isFinite(value))
      })) reasons.push('效果结构超出已审查的固定自身增益范围，需要重新登记')
  }
  return { eligible: reasons.length === 0, skillRef, periodFrames: periodFrames > 0 ? periodFrames : undefined, reasons }
}

export function checkNsSchedulingRegistration(data, catalog) {
  const errors = [], entries = []
  const config = catalog.nsScheduling
  const issue = (path, message) => errors.push({ path: 'nsScheduling.' + path, message })
  if (config?.version !== 1) issue('version', 'Unsupported NS scheduler version')
  const policy = config?.policies?.cast_reset
  const expected = { clock: 'cast_start', busy: 'wait_idle', controlled: 'wait_clear', overdue: 'coalesce', failure: 'reject_cycle' }
  if (Object.keys(config?.policies ?? {}).some(key => key !== 'cast_reset')) issue('policies', 'Unknown scheduler policy')
  for (const [key, value] of Object.entries(expected)) if (policy?.[key] !== value) issue('policies.cast_reset.' + key, 'Unsupported scheduling behavior')
  for (const [id, paths] of Object.entries(config?.skills ?? {})) {
    for (const [path, rule] of Object.entries(paths)) {
      const location = 'skills.' + id + '.' + path
      if (!['P', 'G'].includes(path) || !data[id]?.Skills?.[path]) { issue(location, 'Invalid student/skill reference'); continue }
      if (config.manualOnly?.[id]?.[path]) issue(location, 'Automatic/manual registration conflict')
      if (typeof rule?.scope !== 'string' || !rule.scope.trim()) issue(location, 'Missing reviewed scope')
      const result = inspectNsScheduling(data[id], path === 'G' ? 1 : 0, catalog)
      if (!result.eligible) issue(location, result.reasons.join('; '))
      else entries.push({ path: id + ':' + path + '.scheduler', ruleId: policy?.id, status: policy?.status, strategy: rule.scope, limitations: policy?.limitations })
    }
  }
  for (const [id, paths] of Object.entries(config?.manualOnly ?? {})) {
    for (const [path, reason] of Object.entries(paths)) {
      if (!['P', 'G'].includes(path) || !data[id]?.Skills?.[path]) issue('manualOnly.' + id + '.' + path, 'Invalid student/skill reference')
      if (typeof reason !== 'string' || !reason.trim()) issue('manualOnly.' + id + '.' + path, 'Missing manual limitation')
    }
  }
  return { errors, entries }
}
