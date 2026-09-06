/**
 * 统一数据构建器（唯一 source of truth）。
 *
 * 从 SchaleDB 原始 `data/students.json` / `data/raids.json` 生成精简后的
 * `students.min.json` / `bosses.min.json`，同一产物同时写入：
 *   - src/data    （测试使用）
 *   - public/data （运行时 fetch）
 *
 * 运行：node scripts/gameDataBuilder.ts
 * 依赖：Node >= 23.6（原生 TS 类型剥离），无第三方依赖。
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import catalog from '../src/domain/rules/catalog.json' with { type: 'json' }
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

/** Effect 保留字段（与旧 minify_students.py 的 keep_keys 一致）。 */
const KEEP_EFFECT_KEYS = new Set([
  'Type', 'ApplyFrame', 'Duration', 'Scale', 'Hits', 'Target', 'Stat', 'Value', 'Period',
  'SummonId', 'Chance', 'Condition', 'StackLabel', 'StackSame',
  'Block', 'CriticalCheck', 'Channel', 'Icon', 'Key', 'CasterStat', 'ExtraStatSource', 'ExtraStatRate',
  'ValueType', 'Uses', 'DescParamId',
])

/**
 * 数据修正：这些学生的 EX 文本为“指定 1 名友方”，但 SchaleDB 原始 Target 写成
 * AllyMain（全体前锋）。与忧（10035）等正常单体技能一致，规范化为 Ally。
 * 伊吹（泳装）20060 为特殊机制，不在此列。
 */
const SINGLE_ALLY_EX_IDS = new Set([
  '10030', '10064', '10085', '10089', '10117', '10123',
  '20008', '20020', '20039', '20041', '20048', '20050',
])

type RawEffect = Record<string, unknown>
type RawSkill = Record<string, unknown>

function cleanEffects(effects: unknown): RawEffect[] {
  if (!Array.isArray(effects)) return []
  return effects
    .filter((effect): effect is RawEffect => !!effect && typeof effect === 'object')
    .map(effect => Object.fromEntries(Object.entries(effect).filter(([key]) => KEEP_EFFECT_KEYS.has(key))))
}

function cleanEx(skill: RawSkill | undefined | null): Record<string, unknown> | null {
  if (!skill) return null
  const cleaned: Record<string, unknown> = {
    Name: skill.Name ?? '',
    Desc: skill.Desc ?? '',
    Parameters: skill.Parameters ?? [],
    Cost: skill.Cost ?? [],
    Duration: skill.Duration ?? 0,
    Range: skill.Range ?? 0,
    Radius: skill.Radius ?? null,
    Icon: skill.Icon ?? '',
    Effects: cleanEffects(skill.Effects),
  }
  if (Array.isArray(skill.ExtraSkills)) {
    cleaned.ExtraSkills = skill.ExtraSkills.map(extra => {
      const es = extra as RawSkill
      return {
        Id: es.Id ?? null,
        Name: es.Name ?? '',
        Desc: es.Desc ?? '',
        Parameters: es.Parameters ?? [],
        Cost: es.Cost ?? [],
        Duration: es.Duration ?? 0,
        Range: es.Range ?? 0,
        Radius: es.Radius ?? null,
        Icon: es.Icon ?? '',
        Effects: cleanEffects(es.Effects),
      }
    })
  }
  return cleaned
}

function cleanPublic(skill: RawSkill | undefined | null): Record<string, unknown> | null {
  if (!skill) return null
  return {
    Name: skill.Name ?? '',
    Desc: skill.Desc ?? '',
    Parameters: skill.Parameters ?? [],
    Duration: skill.Duration ?? 0,
    Range: skill.Range ?? 0,
    Radius: skill.Radius ?? null,
    Icon: skill.Icon ?? '',
    Effects: cleanEffects(skill.Effects),
  }
}

function cleanPassive(skill: RawSkill | undefined | null): Record<string, unknown> | null {
  if (!skill) return null
  return {
    Name: skill.Name ?? '',
    Desc: skill.Desc ?? '',
    Parameters: skill.Parameters ?? [],
    Icon: skill.Icon ?? '',
    Effects: cleanEffects(skill.Effects),
  }
}

function cleanNormal(skill: RawSkill | undefined | null): Record<string, unknown> | null {
  if (!skill) return null
  // 普攻是一棵动作数据树，不使用技能效果的精简白名单：保留 FormChange、
  // FixedFrameRate 和伤害修正字段。新增字段由规则门禁报告，不能在构建时丢弃。
  return structuredClone(skill)
}

function normalizeSingleAllyEx(ex: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!ex) return ex
  for (const effect of ex.Effects as RawEffect[]) {
    const target = effect.Target
    if (target === 'AllyMain') {
      effect.Target = 'Ally'
    } else if (Array.isArray(target)) {
      effect.Target = target.map(value => value === 'AllyMain' ? 'Ally' : value)
    }
  }
  return ex
}

/**
 * 泳装伊吹 20060：基础 EX 中的暴伤 Buff 属于变形技能「选哪个好呢？」，
 * SchaleDB 原始数据把它错位放在基础 EX Effects。这里移动到 CH0347Ex02，
 * 避免首放「伊吹的好朋友！」时错误地给全体前锋加暴伤。
 */
function normalizeIbukiSwimsuitEx(ex: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!ex) return ex
  const baseEffects = (ex.Effects as RawEffect[] | undefined) ?? []
  const critIndex = baseEffects.findIndex(effect =>
    effect.Type === 'Buff' && effect.Stat === 'CriticalDamageRate_Coefficient')
  if (critIndex < 0) return ex
  const [critEffect] = baseEffects.splice(critIndex, 1)
  const target = ((ex.ExtraSkills as RawSkill[] | undefined) ?? []).find(extra => extra.Id === 'CH0347Ex02')
  if (!target) return ex
  target.Effects = critEffect ? [critEffect] : []
  return ex
}

/**
 * 乐队状态施放源：和纱/好美/夏/爱莉的 EX 按技能等级施加 CH0220_Public 层数。
 * 人工核对 Desc 后显式登记（禁止从文本推导）；Value 行按 EX 等级 1-5 索引。
 */
const BAND_STATE_EX_IDS: Readonly<Record<string, readonly (readonly number[])[]>> = catalog.band.exGrants

function appendBandStateEx(ex: Record<string, unknown> | null, sid: string): Record<string, unknown> | null {
  if (!ex) return ex
  const layers = BAND_STATE_EX_IDS[sid]
  if (!layers) return ex
  const effects = (ex.Effects as RawEffect[] | undefined) ?? []
  effects.push({ Type: 'Special', Target: 'Self', Key: 'CH0220_Public', Value: layers })
  ex.Effects = effects
  return ex
}

function buildStudents(raw: Record<string, RawSkill>): Record<string, unknown> {
  const minified: Record<string, unknown> = {}
  for (const [sid, s] of Object.entries(raw)) {
    const skills = (s.Skills ?? {}) as Record<string, RawSkill | undefined>
    const weapon = (s.Weapon ?? {}) as RawEffect
    const favorTypes = Array.isArray(s.FavorStatType) ? s.FavorStatType : []
    const favorValues = Array.isArray(s.FavorStatValue) ? s.FavorStatValue : []

    const favorStats = favorTypes
      .map((t, index) => index < favorValues.length ? { t, v: favorValues[index] } : null)
      .filter((value): value is { t: unknown; v: unknown } => value != null)

    let ex = cleanEx(skills.Ex)
    if (SINGLE_ALLY_EX_IDS.has(sid)) ex = normalizeSingleAllyEx(ex)
    if (sid === '20060') ex = normalizeIbukiSwimsuitEx(ex)
    ex = appendBandStateEx(ex, sid)

    minified[sid] = {
      Id: s.Id,
      Name: s.Name,
      // SchaleDB 部分学生 Icon 为 null（联动/早期数据）；头像资源按学生 ID 命名，
      // 与 fetch-images.mjs 的 `s.Icon || id` 命名约定对齐。
      Icon: s.Icon ?? String(s.Id),
      School: s.School ?? '',
      SquadType: s.SquadType ?? '',
      TacticRole: s.TacticRole ?? '',
      Position: s.Position ?? '',
      StarGrade: s.StarGrade ?? 1,
      BulletType: s.BulletType ?? '',
      ArmorType: s.ArmorType ?? '',
      WeaponType: s.WeaponType ?? '',
      Cover: s.Cover ?? false,
      Street: s.StreetBattleAdaptation ?? 0,
      Outdoor: s.OutdoorBattleAdaptation ?? 0,
      Indoor: s.IndoorBattleAdaptation ?? 0,
      ATK: s.AttackPower100 ?? 0,
      HP: s.MaxHP100 ?? 0,
      DEF: s.DefensePower100 ?? 0,
      HEAL: s.HealPower100 ?? 0,
      Dodge: s.DodgePoint ?? 0,
      Accuracy: s.AccuracyPoint ?? 0,
      Crit: s.CriticalPoint ?? 0,
      CritDMG: s.CriticalDamageRate ?? 0,
      Ammo: s.AmmoCount ?? 0,
      AmmoCost: s.AmmoCost ?? 0,
      Range: s.Range ?? 0,
      Sight: s.SightPoint ?? 0,
      Regen: s.RegenCost ?? 0,
      Favor: favorStats,
      // 召唤物来源与掩体元数据；引擎按此关联独立 Summon 实例。
      Summons: s.Summons ?? [],
      Skills: {
        N: cleanNormal(skills.Normal),
        E: ex,
        P: cleanPublic(skills.Public),
        G: cleanPublic(skills.GearPublic),
        PS: cleanPassive(skills.Passive),
        WP: cleanPassive(skills.WeaponPassive),
        EP: cleanPassive(skills.ExtraPassive),
      },
      Weapon: {
        ATK: weapon.AttackPower100 ?? 0,
        HP: weapon.MaxHP100 ?? 0,
        HEAL: weapon.HealPower100 ?? 0,
      },
      HasGear: Array.isArray((s.Gear as RawEffect | undefined)?.Released)
        ? ((s.Gear as RawEffect).Released as unknown[]).some(Boolean)
        : false,
    }
  }
  return minified
}

function buildBosses(raw: Record<string, unknown>): Record<string, unknown> {
  const bosses: Record<string, unknown> = {}
  const raids = Array.isArray(raw.Raid) ? raw.Raid : []
  for (const entry of raids as RawSkill[]) {
    bosses[String(entry.Id)] = {
      Id: entry.Id,
      PathName: entry.PathName,
      Name: entry.Name ?? entry.PathName,
      ArmorType: entry.ArmorType,
      BulletType: entry.BulletType,
      BulletTypeInsane: entry.BulletTypeInsane ?? entry.BulletType,
      Terrain: entry.Terrain,
      BattleDuration: entry.BattleDuration ?? Array(8).fill(180),
      MaxDifficulty: entry.MaxDifficulty ?? Array(3).fill(6),
    }
  }
  return bosses
}

function writeJson(relativePath: string, data: unknown): void {
  const target = path.join(ROOT, relativePath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(data), 'utf8')
}

function main(): void {
  const students = JSON.parse(readFileSync(path.join(ROOT, 'data/students.json'), 'utf8')) as Record<string, RawSkill>
  const raids = JSON.parse(readFileSync(path.join(ROOT, 'data/raids.json'), 'utf8')) as Record<string, unknown>

  const studentData = buildStudents(students)
  const bossData = buildBosses(raids)

  for (const dir of ['src/data', 'public/data']) {
    writeJson(`${dir}/students.min.json`, studentData)
    writeJson(`${dir}/bosses.min.json`, bossData)
  }

  const originalSize = statSync(path.join(ROOT, 'data/students.json')).size
  const outputSize = statSync(path.join(ROOT, 'src/data/students.min.json')).size
  console.log(`原始大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`精简大小: ${(outputSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`压缩比: ${(outputSize / originalSize * 100).toFixed(1)}%`)
  console.log(`学生数量: ${Object.keys(studentData).length}`)
  console.log(`Boss 数量: ${Object.keys(bossData).length}`)
  console.log('已写入 src/data 与 public/data（同一产物）')
}

main()
