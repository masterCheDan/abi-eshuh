import type { Student, StudentDB, StudentSkills, SkillEffect } from '../types/student'

/**
 * 将 SchaleDB 原始数据转换为排轴工具使用的精简格式
 */
export function transformStudentData(raw: Record<string, any>): StudentDB {
  const result: StudentDB = {}

  for (const [id, s] of Object.entries(raw)) {
    result[id] = transformSingleStudent(s)
  }

  return result
}

function transformSingleStudent(raw: any): Student {
  const skills = raw.Skills || {}
  const weapon = raw.Weapon || {}
  const favorTypes: string[] = raw.FavorStatType || []
  const favorValues: number[][] = raw.FavorStatValue || []

  return {
    Id: raw.Id,
    PathName: raw.PathName || '',
    Name: raw.Name || '',
    Icon: raw.Icon || '',

    School: raw.School,
    SquadType: raw.SquadType,
    TacticRole: raw.TacticRole,
    Position: raw.Position,
    StarGrade: raw.StarGrade || 1,

    BulletType: raw.BulletType,
    ArmorType: raw.ArmorType,
    WeaponType: raw.WeaponType,
    Cover: raw.Cover ?? false,

    StreetBattleAdaptation: raw.StreetBattleAdaptation ?? 0,
    OutdoorBattleAdaptation: raw.OutdoorBattleAdaptation ?? 0,
    IndoorBattleAdaptation: raw.IndoorBattleAdaptation ?? 0,

    AttackPower: raw.AttackPower100 ?? 0,
    MaxHP: raw.MaxHP100 ?? 0,
    DefensePower: raw.DefensePower100 ?? 0,
    HealPower: raw.HealPower100 ?? 0,
    DodgePoint: raw.DodgePoint ?? 0,
    AccuracyPoint: raw.AccuracyPoint ?? 0,
    CriticalPoint: raw.CriticalPoint ?? 0,
    CriticalDamageRate: raw.CriticalDamageRate ?? 0,

    FavorStats: favorTypes.map((type, i) => ({
      statType: type as 'AttackPower' | 'MaxHP' | 'DefensePower' | 'HealPower',
      values: favorValues[i] || [],
    })),

    AmmoCount: raw.AmmoCount ?? 0,
    AmmoCost: raw.AmmoCost ?? 0,
    Range: raw.Range ?? 0,
    SightPoint: raw.SightPoint ?? 0,
    RegenCost: raw.RegenCost ?? 0,

    Skills: transformSkills(skills),

    Weapon: {
      AttackPower: weapon.AttackPower100 ?? 0,
      MaxHP: weapon.MaxHP100 ?? 0,
      HealPower: weapon.HealPower100 ?? 0,
    },

    HasGear: raw.Gear?.Released?.some?.((r: boolean) => r) ?? false,
  }
}

function transformSkills(raw: any): StudentSkills {
  return {
    Normal: {
      Effects: raw.Normal?.Effects?.map(transformEffect) || [],
      Frames: raw.Normal?.Frames || {},
      Radius: raw.Normal?.Radius,
    },
    Ex: {
      Name: raw.Ex?.Name || '',
      Desc: raw.Ex?.Desc || '',
      Parameters: raw.Ex?.Parameters || [],
      Cost: raw.Ex?.Cost || [],
      Duration: raw.Ex?.Duration || 0,
      Range: raw.Ex?.Range || 0,
      Radius: raw.Ex?.Radius,
      Icon: raw.Ex?.Icon || '',
      Effects: raw.Ex?.Effects?.map(transformEffect) || [],
      Selectable: raw.Ex?.Selectable,
      ExtraSkills: raw.Ex?.ExtraSkills,
      GroupLabel: raw.Ex?.GroupLabel,
    },
    Public: {
      Name: raw.Public?.Name || '',
      Desc: raw.Public?.Desc || '',
      Parameters: raw.Public?.Parameters || [],
      Duration: raw.Public?.Duration || 0,
      Range: raw.Public?.Range || 0,
      Radius: raw.Public?.Radius,
      Icon: raw.Public?.Icon || '',
      Effects: raw.Public?.Effects?.map(transformEffect) || [],
      ExtraSkills: raw.Public?.ExtraSkills,
      GroupLabel: raw.Public?.GroupLabel,
    },
    GearPublic: {
      Name: raw.GearPublic?.Name || '',
      Desc: raw.GearPublic?.Desc || '',
      Parameters: raw.GearPublic?.Parameters || [],
      Duration: raw.GearPublic?.Duration || 0,
      Range: raw.GearPublic?.Range || 0,
      Radius: raw.GearPublic?.Radius,
      Icon: raw.GearPublic?.Icon || '',
      Effects: raw.GearPublic?.Effects?.map(transformEffect) || [],
    },
    Passive: {
      Name: raw.Passive?.Name || '',
      Desc: raw.Passive?.Desc || '',
      Parameters: raw.Passive?.Parameters || [],
      Icon: raw.Passive?.Icon || '',
      Effects: raw.Passive?.Effects?.map(transformEffect) || [],
    },
    WeaponPassive: {
      Name: raw.WeaponPassive?.Name || '',
      Desc: raw.WeaponPassive?.Desc || '',
      Parameters: raw.WeaponPassive?.Parameters || [],
      Icon: raw.WeaponPassive?.Icon || '',
      Effects: raw.WeaponPassive?.Effects?.map(transformEffect) || [],
    },
    ExtraPassive: {
      Name: raw.ExtraPassive?.Name || '',
      Desc: raw.ExtraPassive?.Desc || '',
      Parameters: raw.ExtraPassive?.Parameters || [],
      Icon: raw.ExtraPassive?.Icon || '',
      Effects: raw.ExtraPassive?.Effects?.map(transformEffect) || [],
    },
  }
}

function transformEffect(raw: any): SkillEffect {
  return {
    Type: raw.Type,
    ApplyFrame: raw.ApplyFrame,
    Duration: raw.Duration,
    Scale: raw.Scale,
    Hits: raw.Hits,
    Target: raw.Target,
    Stat: raw.Stat,
    Value: raw.Value,
    Block: raw.Block,
    CriticalCheck: raw.CriticalCheck,
    DescParamId: raw.DescParamId,
    StackLabel: raw.StackLabel,
    StackSame: raw.StackSame,
    Period: raw.Period,
    ZoneDuration: raw.ZoneDuration,
    ZoneHitInterval: raw.ZoneHitInterval,
    Chance: raw.Chance,
    SummonId: raw.SummonId,
    Reposition: raw.Reposition,
    Condition: raw.Condition,
    Restrictions: raw.Restrictions,
    CasterStat: raw.CasterStat,
    SourceStat: raw.SourceStat,
    ExtraStatRate: raw.ExtraStatRate,
    ExtraStatSource: raw.ExtraStatSource,
    IgnoreDef: raw.IgnoreDef,
    Key: raw.Key,
    OverrideSkillType: raw.OverrideSkillType,
    OverrideSlot: raw.OverrideSlot,
    SubstitudeCondition: raw.SubstitudeCondition,
    SubstitudeScale: raw.SubstitudeScale,
    TargetHpRateModifier: raw.TargetHpRateModifier,
    HitFrames: raw.HitFrames,
  }
}
