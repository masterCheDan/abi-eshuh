/**
 * Boss 类型定义
 *
 * 数据来源: SchaleDB raids.json
 * 精简后: public/data/bosses.min.json
 */

export type BossDifficulty = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type BossTerrain = 'Street' | 'Outdoor' | 'Indoor'
export type BossArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor'

/** 单个 Boss 的精简数据 */
export interface BossData {
    /** Boss ID (1-14) */
    Id: number
    /** 英文短名 (如 "binah", "kaiten") */
    PathName: string
    /** 显示名 (如 "Binah", "KAITEN FX Mk.0") */
    Name: string
    /** Boss 护甲类型 */
    ArmorType: BossArmorType
    /** Boss 攻击类型 (Normal=无克制) */
    BulletType: string
    /** Insane+ 攻击类型 */
    BulletTypeInsane: string
    /** 适用地形 */
    Terrain: BossTerrain[]
    /** 各难度战斗时长 (秒) */
    BattleDuration: number[]
    /** 各难度最高等级 (6=Extreme, 7=Insane, 8=Torment) */
    MaxDifficulty: number[]
}
