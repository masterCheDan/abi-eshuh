# `data/students.json` 数据结构参考

> 最后更新：2026-06-24
> 数据来源：SchaleDB

---

## 规模

| 属性 | 值 |
|------|-----|
| 学生数 | 264 |
| 原始大小 | 4.69 MB |
| 精简后 (`students.min.json`) | 0.96 MB（压缩比 20.4%） |
| 每个学生顶层键 | ~70+ 个 |

---

## 技能体系（7 种）

```
Skills
├── Normal           普通攻击（仅有 Frames + Effects，无 Name/Desc）
├── Ex               主动 EX 技能（Cost / Duration(帧) / Radius）
├── Public           公共被动技能（每 25 秒自动触发）
├── GearPublic       专武强化后的公共技能（替代 Public，HasGear=true 时使用）
├── Passive          被动技能（常驻 Buff，战术入场时触发）
├── WeaponPassive    武器被动（常驻 Buff）
└── ExtraPassive     副技能 / 子技能（条件触发）
```

### 技能结构差异

| 字段 | Ex | Public / GearPublic | Passive / WP / EP |
|------|:--:|:--:|:--:|
| `Name` | ✅ | ✅ | ✅ |
| `Desc` | ✅ | ✅ | ✅ |
| `Parameters` | ✅ | ✅ | ✅ |
| `Icon` | ✅ | ✅ | ✅ |
| `Duration` | ✅（帧） | ✅（帧） | ❌ |
| `Cost` | ✅ | ❌ | ❌ |
| `Range` | ✅ | ✅ | ❌ |
| `Radius` | ✅ | ✅ | ❌ |
| `Effects` | ✅ | ✅ | ✅ |

### Normal 攻击特殊结构

```
Normal:
  ├── Frames（所有 Attack* Duration 字段，单位：帧）
  └── Effects（通常仅有 Damage）
```

---

## Gear（专武 / 爱用品）

| 情况 | 数量 | HasGear |
|------|------|---------|
| `Gear.Released = [true, ...]` | 63 | `true` → 使用 `GearPublic` 替代 `Public` |
| `Gear = {}` | 201 | `false` → 使用 `Public` |

```json
{
  "Released": [true, true, true],
  "StatType": ["AccuracyPoint_Base"],
  "StatValue": [[150, 150]],
  "Name": "...",
  "Desc": "..."
}
```

---

## Effect Type 完整清单（14 种 + 3 个子类型）

### 瞬时效果（无持续时间）

| Type | 说明 | 前摇 | 特殊字段 |
|------|------|------|----------|
| `Damage` | 伤害 | `ApplyFrame` | `Block`, `CriticalCheck`, `Hits`, `Scale` |
| `Heal` | 治疗 | `ApplyFrame` | `Target`, `Scale` |
| `Knockback` | 击退 | 无 | `Scale`（击退距离） |
| `Dispel` | 驱散 | 无 | `Target` |
| `ConcentratedTarget` | 集火标记 | `ApplyFrame` | `Scale` |
| `Accumulation` | 累积 | 无 | `Scale` |

### 持续效果（有 Duration/Channel/Scale 作为时长）

| Type | 说明 | 时长来源 | 单位 | 特殊字段 |
|------|------|---------|------|----------|
| `Buff` | 增益 | `Effect.Duration` | ms | `Target`, `Stat`, `Channel`, `Value` |
| `Debuff` | 减益 | 同上（Buff + `Target=Enemy`） | ms | 同上 |
| `Shield` | 护盾 | `Effect.Duration` | ms | `Target`, `Scale` |
| `Regen` | 持续恢复(HoT) | `Effect.Duration` | ms | `Period`, `ExtraStatSource`, `ExtraStatRate` |
| `CrowdControl` | 控制（眩晕等） | `Effect.Scale[-1]` | ms | `Chance`(10000=100%), `Icon`(如`Stunned`) |
| `Summon` | 召唤物 | `Effect.Duration` | ms | `SummonId`, `CasterStat`, `Stat`, `Channel` |
| `Special` | 特殊（FormChange等） | `Effect.Channel` | ms | `Key`, `Value` |
| `DamageDebuff` | 持续伤害(DoT) | `Effect.Duration` | ms | `Period`, `Icon`(如`Burn`) |

### 无持续但有条件

| Type | 说明 | 特殊字段 |
|------|------|----------|
| `CostChange` | COST 变更 | `Uses`(可用次数), `ValueType`, `Scale` |

---

## ⚠️ 关键注意事项

### 1. Duration 单位混用

| 级别 | 单位 | 示例 |
|------|------|------|
| 技能级 `Duration`（Ex/Public） | **帧**（30fps） | `Ex.Duration = 132` 表示 4.4 秒 |
| Effect 级 `Duration`（Buff/Shield等） | **毫秒** | `Buff.Duration = 20000` 表示 20 秒 |

**转换公式：** `帧 = Math.round(毫秒 × 30 / 1000)`

### 2. ApplyFrame 缺失的情况

- `ExtraPassive` 的 Effects **无** `ApplyFrame` → 默认 `0`（条件触发常驻）
- `Passive` / `WeaponPassive` 的 Effects **无** `ApplyFrame` → 战术入场时立即生效
- 部分 `DamageDebuff` 无 `ApplyFrame` → 默认 `0`

### 3. CrowdControl 时长提取

- 时长 = `Scale[等级索引]`，单位 ms
- 取最高等级：`Scale[Scale.length - 1]`
- `Chance = 10000` 表示 100% 概率

### 4. Special 时长提取

- 时长 = `Effect.Channel`，单位 ms
- 示例：瞬的 FormChange，`Channel = 16000` 表示 16 秒

### 5. `Desc` 字段含自定义 HTML

```html
<b>每25秒：</b>
<b:CriticalDamage>增加<?1>
```

—— 后续渲染描述时需要解析 `<b>`, `<b:...>`, `<?n>` 等标记

### 6. 技能描述中的 `<?n>` 参数映射

`<?1>` 映射到 `Parameters[0]`，`<?2>` 映射到 `Parameters[1]`，依此类推。

---

## 学生顶层字段速查

### 已保留（minify 输出）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | number | 学生 ID |
| `Name` | string | 名称 |
| `School` | string | 学校 |
| `SquadType` | `Main`/`Support` | 前后排 |
| `TacticRole` | string | 战术角色 |
| `Position` | `Front`/`Middle`/`Back` | 站位 |
| `StarGrade` | 1-3 | 星级 |
| `BulletType` | string | 弹种 |
| `ArmorType` | string | 护甲类型 |
| `WeaponType` | string | 武器类型 |
| `ATK/HP/DEF/HEAL` | number | 满级满装属性 |
| `Regen` | number | COST 回复速度 |
| `Cover` | boolean | 是否有掩体 |
| `Street/Outdoor/Indoor` | 0-5 | 地形适性 |
| `HasGear` | boolean | 是否有专武 |
| `Skills` | object | 7 种技能 |
| `Weapon` | object | 武器属性 |
| `Favor` | object[] | 好感度加成 |

### 未保留（仅原始数据有）

`IsLimited`, `IsReleased`, `Club`, `Birthday`, `CharacterAge`, `CharHeightMetric`, `Hobby`, `CharacterVoice`, `Illustrator`, `Designer`, `Equipment`, `CollectionBG`, `FamilyName`, `PersonalName`, `ProfileIntroduction`, `MemoryLobby`, `FavorAlts`, `FavorItemTags`, `Summons`, `StabilityPoint`, `PotentialMaterial`, `SkillExMaterial*`, `SkillMaterial*`, `FurnitureInteraction`
