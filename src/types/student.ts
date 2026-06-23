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

// ==================== 技能相关 ====================

/**
 * 技能效果
 *
 * ⏱️ 时间单位：
 *   - ApplyFrame → 帧（30帧 = 1秒）
 *   - Duration、Period → 毫秒（1000ms = 1秒）
 */
export interface SkillEffect {
  Type: string
  /** 生效延迟（帧） */
  ApplyFrame?: number
  /** 效果持续时间（毫秒） */
  Duration?: number
  /** 伤害/治疗倍率 */
  Scale?: number[]
  /** 击中次数 */
  Hits?: number[]
  /** 目标类型 */
  Target?: string[]
  /** 影响属性 */
  Stat?: string
  /** 属性值（各等级） */
  Value?: number[][]
  /** 周期间隔（毫秒） */
  Period?: number
  /** 召唤单位 ID */
  SummonId?: number
  /** 触发概率 */
  Chance?: number
  /** 触发条件 */
  Condition?: string
  /** 叠层标签 */
  StackLabel?: string
  StackSame?: boolean
}

export interface ExSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  Cost: number[]
  /** 动画时长（帧） */
  Duration: number
  Range: number
  Radius?: { Type: string; Radius: number }[]
  Icon: string
  Effects: SkillEffect[]
}

export interface PublicSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  /** 动画时长（帧） */
  Duration: number
  Range: number
  Radius?: { Type: string; Radius: number }[]
  Icon: string
  Effects: SkillEffect[]
}

export interface PassiveSkill {
  Name: string
  Desc: string
  Parameters: string[][]
  Icon: string
  Effects: SkillEffect[]
}

export interface NormalAttack {
  /** 帧数据（单位：帧） */
  Frames: {
    AttackEnterDuration: number
    AttackStartDuration: number
    AttackEndDuration: number
    AttackBurstRoundOverDelay: number
    AttackIngDuration: number
    AttackReloadDuration: number
    AttackReadyStartDuration?: number
    AttackReadyEndDuration?: number
  }
  Radius?: { Type: string; Radius: number }[]
}

export interface StudentSkills {
  /** Normal attack */
  N: NormalAttack
  /** EX skill */
  E: ExSkill
  /** Public skill (auto) */
  P: PublicSkill
  /** Gear-enhanced public skill */
  G: PublicSkill
  /** Passive skill */
  PS: PassiveSkill
  /** Weapon passive skill */
  WP: PassiveSkill
  /** Extra passive skill (sub skill) */
  EP: PassiveSkill
}

// ==================== 学生主数据（精简版） ====================

export interface Student {
  Id: number
  Name: string
  Icon: string

  School: School
  SquadType: SquadType
  TacticRole: TacticRole
  Position: Position
  StarGrade: number

  BulletType: BulletType
  ArmorType: ArmorType
  WeaponType: WeaponType
  Cover: boolean

  /** 街道战适性 */
  Street: BattleAdaptation
  /** 户外战适性 */
  Outdoor: BattleAdaptation
  /** 室内战适性 */
  Indoor: BattleAdaptation

  /** 攻击力（满级） */
  ATK: number
  /** 生命值（满级） */
  HP: number
  /** 防御力（满级） */
  DEF: number
  /** 治愈力（满级） */
  HEAL: number
  Dodge: number
  Accuracy: number
  Crit: number
  CritDMG: number

  /** 弹药数 */
  Ammo: number
  /** 每发弹药消耗 */
  AmmoCost: number
  Range: number
  Sight: number
  /** COST 恢复速度 */
  Regen: number

  /** 好感度属性加成 */
  Favor: { t: string; v: number[] }[]

  Skills: StudentSkills

  Weapon: {
    ATK: number
    HP: number
    HEAL: number
  }

  HasGear: boolean
}

/** 以 ID 为 key 的学生字典 */
export type StudentDB = Record<string, Student>
