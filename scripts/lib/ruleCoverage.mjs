import { inspectActionData, validateActionCatalog } from '../../src/domain/rules/actionData.mjs'
import { checkNsSchedulingRegistration } from '../../src/domain/rules/nsSchedulingData.mjs'

/** Pure registration validation; no description parsing or input mutation. */
export function checkCoverage(data, catalog, bindings) {
  const errors = [], entries = [], levels = ['implemented', 'manual_fact', 'state_only', 'partial']
  const issue = (path, message) => errors.push({ path, message })
  const text = v => typeof v === 'string' && v.trim().length > 0
  const positive = v => Number.isFinite(v) && v > 0
  const integer = v => Number.isInteger(v) && v >= 0
  const records = [], ids = new Set()
  const actionInspections = []
  const schedulingCheck = checkNsSchedulingRegistration(data, catalog)
  errors.push(...schedulingCheck.errors)
  entries.push(...schedulingCheck.entries)
  for (const [key, policy] of Object.entries(catalog.nsScheduling?.policies ?? {})) records.push(['nsScheduling.policies.' + key, policy])
  errors.push(...validateActionCatalog(catalog))
  records.push(['actions.policy', catalog.actions?.policy])
  records.push(['actions.pendingInterruption', catalog.actions?.pendingInterruption])
  if (catalog.version !== 1) issue('catalog.version', 'Unsupported catalog version')
  for (const [category, table] of Object.entries(catalog.policies ?? {}))
    for (const [key, policy] of Object.entries(table)) records.push(['policies.' + category + '.' + key, policy])
  for (const category of ['triggers', 'dispel'])
    for (const [key, policy] of Object.entries(catalog[category] ?? {})) records.push([category + '.' + key, policy])
  const record = (path, p) => entries.push({ path, ruleId: p.id, status: p.status, strategy: p.strategy, limitations: p.limitations })
  for (const [path, p] of records) {
    if (!p || typeof p !== 'object') { issue(path, 'Missing policy'); continue }
    if (!text(p.id) || ids.has(p.id)) issue(path, 'Missing or duplicate stable rule ID')
    ids.add(p.id)
    if (!text(p.handler) || !text(p.strategy)) issue(path, 'Missing handler or strategy')
    if (!levels.includes(p.status)) issue(path, 'Invalid support level')
    if (p.status !== 'implemented' && !text(p.limitations)) issue(path, 'Non-complete policy requires limitations')
    if (p.durationMs != null && !positive(p.durationMs)) issue(path, 'Invalid configured duration')
    if (p.unlocksExtraEx != null && typeof p.unlocksExtraEx !== 'boolean') issue(path, 'Invalid form unlock flag')
    if (path.startsWith('triggers.')) {
      if (!['manual', 'battle_start', 'interval', 'attack_count', 'self_ex'].includes(p.mode)) issue(path, 'Invalid trigger mode')
      if (p.mode === 'manual' && (!Array.isArray(p.reasons) || !p.reasons.length || p.reasons.some(reason => !text(reason)))) issue(path, 'Manual trigger requires explicit reasons')
    }
    if (bindings && typeof bindings[p.handler] !== 'function') issue(path, 'Missing runtime binding: ' + p.handler)
    record('catalog.' + path, p)
  }
  function use(category, key, path) {
    const p = catalog.policies?.[category]?.[key]
    if (!p) { issue(path, 'Unregistered ' + category + ': ' + String(key)); return }
    record(path, p)
  }
  function effect(e, path) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) { issue(path, 'Invalid effect'); return }
    use('effects', e.Type, path + '.Type')
    for (const [i, target] of (Array.isArray(e.Target) ? e.Target : e.Target == null ? [] : [e.Target]).entries()) use('targets', target, path + '.Target[' + i + ']')
    if (e.Stat != null) use('stats', e.Stat, path + '.Stat')
    if (['Special', 'Accumulation', 'ConcentratedTarget'].includes(e.Type)) use('specials', e.Key ?? e.Stat ?? '(none)', path + '.Key')
    if (e.Type === 'CostChange') use('costValueTypes', e.ValueType, path + '.ValueType')
    if (e.Type === 'Dispel') {
      if (!catalog.dispel?.default) issue(path, 'No named Dispel policy')
      else record(path + '.dispel', catalog.dispel.default)
    }
    if (e.Condition != null) {
      const c = e.Condition
      if (!c || typeof c !== 'object' || Array.isArray(c)) { issue(path + '.Condition', 'Invalid condition'); return }
      use('conditions', c.Type, path + '.Condition.Type')
      use('conditionParameters', c.Type + ':' + c.Parameter, path + '.Condition.Parameter')
      use('conditionOperands', c.Type + ':' + (c.Operand ?? '(missing)'), path + '.Condition.Operand')
    }
  }
  const nodes = new Map()
  function walk(student, skill, path) {
    const location = student.Id + ':' + path
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) { issue(location, 'Invalid skill'); return }
    nodes.set(location, skill)
    const refs = catalog.skills?.[student.Id]?.[path]
    if (!Array.isArray(refs) || !refs.length) issue(location, 'Missing explicit skill trigger registration')
    else {
      if (new Set(refs).size !== refs.length) issue(location, 'Duplicate trigger registration')
      for (const id of refs) {
        const p = catalog.triggers?.[id]
        if (!p) { issue(location, 'Unknown trigger policy: ' + id); continue }
        record(location + '.trigger.' + id, p)
        if (id.startsWith('ns.') && (!['P', 'G'].includes(path) || catalog.ns?.[student.Id]?.kind !== p.mode)) issue(location, 'NS trigger does not match schedule rule')
        if (id === 'opening.rule') {
          const publicPath = catalog.opening?.public?.[student.Id]?.kind === 'gear_public' ? 'G' : 'P'
          if (!(path === 'EP' && catalog.opening?.epIds?.includes(student.Id)) && !(catalog.opening?.public?.[student.Id] && path === publicPath)) issue(location, 'Opening trigger has no matching source rule')
        }
        if (id === 'opening.passive' && !['PS', 'WP'].includes(path)) issue(location, 'Passive opening rule on incompatible skill')
        if (id === 'manual.ex' && path !== 'E' || id === 'manual.public' && !['P', 'G'].includes(path) || id === 'manual.extra_passive' && path !== 'EP' || id === 'manual.extra_ex' && !path.includes('.ExtraSkills[')) issue(location, 'Manual trigger registered on incompatible skill')
        if (id === 'linked.self_ex' && !(path === 'EP' && catalog.opening?.selfExEpIds?.includes(student.Id))) issue(location, 'Linked EX trigger has no source rule')
      }
    }
    if (skill.Effects != null && !Array.isArray(skill.Effects)) issue(location + '.Effects', 'Expected effects array')
    else (skill.Effects ?? []).forEach((e, i) => effect(e, location + '.Effects[' + i + ']'))
    if (skill.ExtraSkills != null && !Array.isArray(skill.ExtraSkills)) issue(location + '.ExtraSkills', 'Expected extra skills array')
    else (skill.ExtraSkills ?? []).forEach((extra, i) => walk(student, extra, path + '.ExtraSkills[' + i + ']'))
  }
  function normalEffects(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    if (catalog.actions?.policy) record(path + '.actionData', catalog.actions.policy)
    if (Array.isArray(node.Effects)) node.Effects.forEach((e, i) => effect(e, path + '.Effects[' + i + ']'))
    if (node.FormChange) normalEffects(node.FormChange, path + '.FormChange')
  }
  for (const student of Object.values(data)) {
    const inspection = inspectActionData(student, catalog)
    actionInspections.push(inspection)
    errors.push(...inspection.diagnostics.filter(d => d.severity === 'error' && d.code !== 'INVALID_ACTION_RULE').map(({ path, message }) => ({ path, message })))
    for (const [kind, skill] of Object.entries(student.Skills ?? {})) {
      if (!skill) continue
      if (kind === 'N') normalEffects(skill, student.Id + ':N')
      else walk(student, skill, kind)
    }
  }
  function requireSkill(id, path, context, trigger) {
    const node = nodes.get(id + ':' + path)
    if (!node) issue(context, 'Invalid student/skill reference: ' + id + ':' + path)
    if (trigger && !catalog.skills?.[id]?.[path]?.includes(trigger)) issue(context, 'Missing matching trigger registration: ' + trigger)
    return node
  }
  for (const [id, paths] of Object.entries(catalog.skills ?? {}))
    for (const path of Object.keys(paths)) requireSkill(id, path, 'catalog.skills.' + id + '.' + path)
  function opening(id, path, rule, context) {
    const skill = requireSkill(id, path, context, 'opening.rule')
    if (rule.effectIndices) {
      if (!Array.isArray(rule.effectIndices) || new Set(rule.effectIndices).size !== rule.effectIndices.length) issue(context, 'Invalid or duplicate effect indices')
      else for (const index of rule.effectIndices) if (!integer(index) || !skill?.Effects?.[index]) issue(context + '.effectIndices', 'Invalid effect index: ' + index)
    }
    if (rule.initialCostByLevel && (!Array.isArray(rule.initialCostByLevel) || rule.initialCostByLevel.length !== 10 || rule.initialCostByLevel.some(n => !Number.isFinite(n) || n < 0))) issue(context, 'Initial Cost must contain ten non-negative level values')
    if (rule.syntheticEffects != null && !Array.isArray(rule.syntheticEffects)) issue(context, 'Invalid synthetic effects')
    else (rule.syntheticEffects ?? []).forEach((e, i) => effect(e, id + ':' + path + '.syntheticEffects[' + i + ']'))
  }
  for (const [id, rule] of Object.entries(catalog.opening?.public ?? {})) {
    if (!['public', 'gear_public'].includes(rule.kind)) issue('opening.public.' + id, 'Invalid opening skill kind')
    opening(id, rule.kind === 'gear_public' ? 'G' : 'P', rule, 'opening.public.' + id)
  }
  for (const key of ['epIds', 'selfExEpIds']) {
    const list = catalog.opening?.[key] ?? []
    if (new Set(list).size !== list.length) issue('opening.' + key, 'Duplicate opening student reference')
  }
  for (const id of catalog.opening?.epIds ?? []) opening(id, 'EP', catalog.opening?.overrides?.[id] ?? {}, 'opening.ep.' + id)
  for (const id of Object.keys(catalog.opening?.overrides ?? {})) if (!catalog.opening?.epIds?.includes(Number(id))) issue('opening.overrides.' + id, 'Override has no opening EP registration')
  for (const id of catalog.opening?.selfExEpIds ?? []) {
    requireSkill(id, 'E', 'opening.selfEx.' + id)
    requireSkill(id, 'EP', 'opening.selfEx.' + id, 'linked.self_ex')
  }
  for (const [id, rule] of Object.entries(catalog.ns ?? {})) {
    requireSkill(id, 'P', 'ns.' + id, 'ns.' + rule.kind)
    if (!['interval', 'attack_count'].includes(rule.kind) || !(rule.kind === 'interval' ? positive(rule.seconds) : positive(rule.count) && integer(rule.count))) issue('ns.' + id, 'Invalid NS interval/count')
  }
  for (const [name, rule] of Object.entries(catalog.dispel ?? {})) {
    if (!Array.isArray(rule.removeTypes) || !rule.removeTypes.length) issue('dispel.' + name, 'Missing removal categories')
    else for (const type of rule.removeTypes) use('effects', type, 'dispel.' + name + '.removeTypes')
  }
  const band = catalog.band ?? {}
  for (const [id, values] of Object.entries(band.exGrants ?? {})) {
    const path = 'band.exGrants.' + id, skill = requireSkill(id, 'E', path)
    use('specials', 'CH0220_Public', path + '.Key')
    if (!Array.isArray(values) || values.length !== 1 || ![1, 5].includes(values[0]?.length) || values[0].some(n => !positive(n) || !integer(n))) issue(path, 'Invalid EX layer values')
    const generated = skill?.Effects?.filter(e => e.Type === 'Special' && e.Key === 'CH0220_Public') ?? []
    if (generated.length !== 1 || JSON.stringify(generated[0].Value) !== JSON.stringify(values)) issue(path, 'Generated EX layers differ from shared configuration')
    if (band.caps?.[id + ':CH0220_Public'] == null) issue(path, 'Layer source has no cap')
  }
  for (const [ref, cap] of Object.entries(band.caps ?? {})) {
    const [id, key] = ref.split(':')
    requireSkill(id, 'E', 'band.caps.' + ref)
    use('specials', key, 'band.caps.' + ref)
    if (!positive(cap) || !integer(cap)) issue('band.caps.' + ref, 'Invalid cap')
  }
  for (const [i, rule] of (band.decays ?? []).entries()) {
    const path = 'band.decays[' + i + ']'
    requireSkill(rule.issuerId, 'E', path)
    use('specials', rule.key, path + '.key')
    if (!positive(rule.everyMs) || !positive(rule.remove) || !integer(rule.remove)) issue(path, 'Invalid layer decay')
    if (band.caps?.[rule.issuerId + ':' + rule.key] == null) issue(path, 'Decay has no capped layer source')
  }
  for (const [i, rule] of (band.grants ?? []).entries()) {
    const path = 'band.grants[' + i + ']'
    requireSkill(rule.issuerId, 'EP', path)
    use('specials', rule.sourceKey, path + '.sourceKey')
    use('specials', rule.targetKey, path + '.targetKey')
    if (!Object.keys(band.caps ?? {}).some(ref => ref.endsWith(':' + rule.sourceKey))) issue(path, 'Layer grant has no registered source')
    if (![rule.perLayers, rule.cap].every(n => positive(n) && integer(n))) issue(path, 'Invalid layer grant threshold/cap')
  }
  for (const [id, rule] of Object.entries(band.damage ?? {})) {
    const path = 'band.damage.' + id
    use('specials', rule.key, path + '.key')
    if (!['team-layer-multiplier', 'self-layer-multiplier'].includes(rule.kind)) issue(path, 'Invalid multiplier kind')
    if (!Array.isArray(rule.skillRefs) || !rule.skillRefs.length) issue(path, 'Missing multiplier skill refs')
    else for (const kind of rule.skillRefs) requireSkill(id, { public: 'P', gear_public: 'G', extra_passive: 'EP' }[kind], path)
    if (rule.kind === 'team-layer-multiplier' && (!positive(rule.perLayer) || !positive(rule.maxLayers) || !integer(rule.maxLayers))) issue(path, 'Invalid team layer multiplier')
  }
  const compare = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : JSON.stringify(a).localeCompare(JSON.stringify(b), 'en')
  errors.sort(compare)
  entries.sort(compare)
  actionInspections.sort((a, b) => a.studentId - b.studentId)
  const actions = { version: catalog.actions?.version, scope: 'student_data_only',
    eligible: actionInspections.filter(s => s.automaticEligible).length,
    blocked: actionInspections.length, students: actionInspections }
  return { version: catalog.version, ok: errors.length === 0, counts: Object.fromEntries(levels.map(level => [level, entries.filter(e => e.status === level).length])), entries, errors, actions }
}

export function formatCoverage(report) {
  return [report.ok ? '规则登记检查通过（不代表全部机制完整实现）' : '规则登记检查失败',
    ...Object.entries(report.counts).map(([level, count]) => level + ': ' + count + ' 项登记/使用位置'),
    '动作数据预检 v' + report.actions.version + '：自动资格未开放；' + report.actions.blocked + ' 名学生保留阻碍说明（不代表已启用调度）',
    ...report.errors.map(e => 'ERROR ' + e.path + ': ' + e.message),
    ...report.entries.map(e => '[' + e.status + '] ' + e.path + ' -> ' + e.ruleId + ': ' + e.strategy + (e.limitations ? '；限制：' + e.limitations : '')),
    ...report.actions.students.flatMap(s => s.diagnostics.map(d => '[action:' + d.severity + '] ' + d.path + ' ' + d.code + ': ' + d.message)),
  ].join('\n')
}
