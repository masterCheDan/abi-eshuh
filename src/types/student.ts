// ==================== 战斗相关枚举 ====================

export type School =
  | 'Abydos' | 'Arius' | 'ETC' | 'Gehenna' | 'Highlander'
  | 'Hyakkiyako' | 'Millennium' | 'RedWinter' | 'SRT' | 'Sakugawa'
  | 'Shanhaijing' | 'Tokiwadai' | 'Trinity' | 'Valkyrie' | 'WildHunt'

export type TacticRole = 'DamageDealer' | 'Healer' | 'Supporter' | 'Tanker' | 'Vehicle'

export type Position = 'Front' | 'Middle' | 'Back'

export type BulletType = 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic'

export type ArmorType = 'CompositeArmor' | 'ElasticArmor' | 'HeavyArmor' | 'LightArmor' | 'Unarmed'

export type SquadType = 'Main' | 'Support'

export type WeaponType = 'AR' | 'FT' | 'GL' | 'HG' | 'MG' | 'MT' | 'RG' | 'RL' | 'SG' | 'SMG' | 'SR'

export type BattleAdaptation = 0 | 1 | 2 | 3 | 4 | 5

// ==================== 技能帧 & 效果 ====================

/**
 * 单个技能效果（如一次伤害、一次治疗、一个Buff）
 * 每个 Effect 可以有自己的生效延迟（ApplyFrame）
 *
 * ⏱️ 时间单位说明：
 *   - 技能动画 Duration、ApplyFrame、Frames 系列 → 单位：帧（30帧 = 1秒）
 *   - Effect.Duration、Period、ZoneDuration、ZoneHitInterval → 单位：毫秒（1000ms = 1秒）
 */
export interface SkillEffect {
  Type: string
  /** 生效延迟（帧），从技能开始到该效果实际产生作用 */
  ApplyFrame?: number
  /** 效果持续时间（毫秒），如 Buff 持续 30 秒 = 30000 */
  Duration?: number
  /** 伤害/治疗倍率（各等级） */
  Scale?: number[]
  /** 击中次数 */
  Hits?: number[]
  /** 效果目标 */
  Target?: string[]
  /** 影响属性 */
  Stat?: string
  /** 属性值（各等级） */
  Value?: number[][]
  Block?: number
  CriticalCheck?: string
  DescParamId?: number
  /** Buff 叠层标签 */
  StackLabel?: string
  StackSame?: boolean
  /** 间隔生效（毫秒），周期效果如 DoT/HoT 每多少毫秒触发一次 */
  Period?: number
  /** 领域持续时间（毫秒） */
  ZoneDuration?: number
  /** 领域伤害间隔（毫秒） */
  ZoneHitInterval?: number
  Chance?: number
  /** 召唤单位 */
  SummonId?: number
  /** 位移效果 */
  Reposition?: boolean
  /** 条件 */
  Condition?: string
  Restrictions?: string[]
}

/**
 * 普通攻击的帧数据
 * 所有字段单位均为帧（30帧 = 1秒）
 */
export interface NormalAttackFrames {
  AttackEnterDuration: number
  AttackStartDuration: number
  AttackEndDuration: number
  AttackBurstRoundOverDelay: number
  AttackIngDuration: number
  AttackReloadDuration: number
  AttackReadyStartDuration?: number
  AttackReadyEndDuration?: number
}

// ==================== 技能 ====================

/** EX 技能 */
export interface ExSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  /** 各等级 COST 消耗 */
  Cost: number[]
  /** 动画总时长（帧），30帧 = 1秒 */
  Duration: number
  Range: number
  Radius?: { Type: string; Radius: number }[]
  Icon: string
  Effects: SkillEffect[]
  /** 可选择的多段EX */
  Selectable?: boolean
  ExtraSkills?: unknown
  GroupLabel?: string
}

/** 普通技能（自动触发） */
export interface PublicSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  /** 动画总时长（帧），30帧 = 1秒 */
  Duration: number
  Range: number
  Radius?: { Type: string; Radius: number }[]
  Icon: string
  Effects: SkillEffect[]
  ExtraSkills?: unknown
  GroupLabel?: string
}

/** 被动技能 */
export interface PassiveSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  Icon: string
  Effects: SkillEffect[]
}

/** 学生全部技能 */
export interface StudentSkills {
  Normal: { Effects: SkillEffect[]; Frames: NormalAttackFrames; Radius?: { Type: string; Radius: number }[] }
  Ex: ExSkill
  Public: PublicSkill
  GearPublic: PublicSkill
  Passive: PassiveSkill
  WeaponPassive: PassiveSkill
  ExtraPassive: PassiveSkill
}

// ==================== 学生主数据（排轴用精简版） ====================

export interface Student {
  /** 学生唯一 ID */
  Id: number
  PathName: string
  /** 中文名 */
  Name: string
  /** 头像 Icon */
  Icon: string

  // ---- 编队属性 ----
  School: School
  SquadType: SquadType
  TacticRole: TacticRole
  Position: Position
  StarGrade: number

  // ---- 攻防类型 ----
  BulletType: BulletType
  ArmorType: ArmorType
  WeaponType: WeaponType
  Cover: boolean

  // ---- 地形适应 ----
  StreetBattleAdaptation: BattleAdaptation
  OutdoorBattleAdaptation: BattleAdaptation
  IndoorBattleAdaptation: BattleAdaptation

  // ---- 面板属性（满级基础值） ----
  AttackPower: number
  MaxHP: number
  DefensePower: number
  HealPower: number
  DodgePoint: number
  AccuracyPoint: number
  CriticalPoint: number
  CriticalDamageRate: number

  // ---- 好感度加成 ----
  FavorStats: {
    statType: 'AttackPower' | 'MaxHP' | 'DefensePower' | 'HealPower'
    values: number[]
  }[]

  // ---- 战斗机制 ----
  AmmoCount: number
  AmmoCost: number
  Range: number
  SightPoint: number
  /** COST 恢复速度 */
  RegenCost: number

  // ---- 技能 ----
  Skills: StudentSkills

  // ---- 武器加成 ----
  Weapon: {
    AttackPower: number
    MaxHP: number
    HealPower: number
  }

  /** 是否持有爱用品 */
  HasGear: boolean
}

/** SchaleDB 原始数据格式 */
export type StudentDB = Record<string, Student>
