# 第二步：共享规则登记与覆盖报告

日期：2026-09-05。目录版本：1。检查结论：规则登记通过；不代表全部学生机制已完整实现。

## 交付与边界

- 纯数据目录：[catalog.json](../src/domain/rules/catalog.json)。运行时仍通过 GameRules 查询，Node 检查和数据构建器读取同一目录。
- 原独立白名单已移除；开局、NS 周期、乐队层数与显式学生技能登记集中管理。当前登记 272 名学生、126 条规则策略。
- Effect 的调度/执行分类使用目录；实际函数引用的绑定检查由现有 Vitest 加载运行时，CLI 只选取绑定测试，不递归调用自身。
- 条件、参数、操作符、层数引用、合成效果、技能及任意深度 ExtraSkills 都产生可定位诊断。新增技能不能自动继承“已覆盖”的手动回退。
- B01 已转为正常通过；B02（自动触发验证）、B03（来源冲突）、B04（技能等级分享）保持未修复，共 4 项预期失败。
- 没有修改分享格式、UI 交互、自动触发时序或原始数据；没有运行覆盖产物的数据构建，没有引入新依赖，没有提交。
- 第一阶段报告和指纹清单原样保留。原始数据、两份学生/Boss 产物的指纹均与基线一致。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 完整测试 | 27 个文件；210 项通过、4 项预期失败，共 214 项 |
| 新增保护 | 40 项测试，另将 B01 转为正常通过 |
| 乐队逐等级 | 4 名学生 × EX 1—5 级，共 20 个场景通过；既有上限、衰减、累计授予、倍率测试保持通过 |
| 独立覆盖命令 | 退出码 0；包括实际运行时绑定验证 |
| 类型检查、ESLint、生产构建 | 均通过；新检查脚本也纳入 ESLint |
| git diff --check | 仍有基线已有的 fsm.ts:27 尾部空行；本步未顺带修改 |
| 远程 CI、浏览器视觉、干净依赖安装 | 本步未执行；CI 配置已加入测试、Lint、规则覆盖，随后原 build 执行类型检查及构建 |

复跑：

```powershell
pnpm test
pnpm lint
pnpm exec tsc -b
pnpm check:effects
pnpm check:effects --json
pnpm build
```

直接调用 `node scripts/check-effect-coverage.mjs --json` 返回完整机器可读报告（version、ok、counts、entries、errors）；每条 entries 包含精确路径、规则 ID、等级、策略和限制。文本模式亦列出全部位置。命令只读取数据，不写文件；加载运行时绑定使用已安装的测试工具，需安装开发依赖。

## 分级统计

以下统计是**规则定义及使用位置数**，同一技能涉及多个字段，一条规则也可被多次使用；不能作为已完成技能数量或完整实现百分比。

| 等级 | 位置数 | 判定范围 |
| --- | ---: | --- |
| implemented | 2251 | 指定路径已有执行逻辑及行为保护，不代表整个技能完整 |
| manual_fact | 907 | 显式人工事实策略，当前验证限制另行记录 |
| state_only | 1285 | 仅保存标签、修正器或审计 |
| partial | 2516 | 存在明确尚未覆盖的行为 |

登记信息缺失、未知值、策略缺失、实际处理器绑定缺失、引用错误或受限等级没有限制说明，会使检查失败。成功不能隐藏部分支持：例如乐队计数与活动效果移除的一致性、衰减/授予审计、NS 自身打断、缺失外部属性校验、广泛驱散默认行为均仍保留限制。

## 逐规则明细

完整的所有位置请使用 JSON 命令；下表为每条策略的计数及一个定位示例。`学生ID:技能路径.Effects[index]` 定位至学生压缩数据；`opening`、`band`、`catalog` 路径定位至共享目录。

| 规则 ID | 等级 | 位置数 | 定位示例 | 策略与限制 |
| --- | --- | ---: | --- | --- |
| condition.BuffCount | partial | 6 | 10032:P.Effects[1].Condition.Type | 使用现有 BuffCount 条件验证路径；限制：保持当前验证语义；外部属性缺失、活动层数与特殊状态完整性需后续校验 |
| condition.SkillLevel | implemented | 7 | 10099:E.Effects[0].Condition.Type | 使用现有 SkillLevel 条件验证路径 |
| condition.Special | partial | 23 | 10008:E.Effects[0].Condition.Type | 使用现有 Special 条件验证路径；限制：保持当前验证语义；外部属性缺失、活动层数与特殊状态完整性需后续校验 |
| condition.TargetProp | partial | 11 | 10011:EP.Effects[0].Condition.Type | 使用现有 TargetProp 条件验证路径；限制：保持当前验证语义；外部属性缺失、活动层数与特殊状态完整性需后续校验 |
| cost.BaseAmount | implemented | 13 | 10048:G.Effects[2].ValueType | 直接修改 EX 费用 |
| cost.Coefficient | implemented | 5 | 10035:E.Effects[0].ValueType | 按万分比计算减费量并向零截断 |
| dispel.student-removable-default | partial | 12 | 10029:E.Effects[1].dispel | 沿用学生侧广泛驱散默认类别；限制：尚未逐技能区分可驱散性、阵营与指定种类 |
| effect.Accumulation | partial | 4 | 10033:E.Effects[1].Type | 使用 active 路径处理 Accumulation；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Buff | partial | 1189 | 10000:EP.Effects[0].Type | 使用 active 路径处理 Buff；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.ConcentratedTarget | partial | 7 | 10017:P.Effects[0].Type | 使用 active 路径处理 ConcentratedTarget；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.CostChange | implemented | 18 | 10035:E.Effects[0].Type | 按目标维护 EX 费用修正并在成功施放后消费次数 |
| effect.CrowdControl | partial | 40 | 10005:E.Effects[2].Type | 使用 active 路径处理 CrowdControl；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Damage | partial | 462 | 10000:E.Effects[0].Type | 使用 ledger 路径处理 Damage；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.DamageDebuff | partial | 36 | 10016:E.Effects[1].Type | 使用 ledger 路径处理 DamageDebuff；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Dispel | partial | 12 | 10029:E.Effects[1].Type | 使用 dispel 路径处理 Dispel；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Heal | partial | 73 | 10001:G.Effects[1].Type | 使用 ledger 路径处理 Heal；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Knockback | partial | 10 | 10005:E.Effects[1].Type | 使用 active 路径处理 Knockback；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Regen | partial | 33 | 10001:E.Effects[0].Type | 使用 ledger 路径处理 Regen；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Shield | partial | 21 | 10005:EP.Effects[0].Type | 使用 active 路径处理 Shield；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Special | partial | 37 | 10008:G.Effects[1].Type | 使用 active 路径处理 Special；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| effect.Summon | partial | 32 | 10003:E.Effects[1].Type | 使用 summon 路径处理 Summon；限制：仅覆盖当前调度、状态或审计行为；不包含真实血量结算，完整生命周期与逐技能例外需后续验收 |
| operand.BuffCount:(missing) | implemented | 6 | 10032:P.Effects[1].Condition.Operand | 现有 BuffCount 条件操作 区间判断 |
| operand.SkillLevel:(missing) | implemented | 7 | 10099:E.Effects[0].Condition.Operand | 现有 SkillLevel 条件操作 区间判断 |
| operand.Special:Exists | implemented | 23 | 10008:E.Effects[0].Condition.Operand | 现有 Special 条件操作 Exists |
| operand.TargetProp:Equal | implemented | 10 | 10011:EP.Effects[0].Condition.Operand | 现有 TargetProp 条件操作 Equal |
| operand.TargetProp:NotEqual | implemented | 2 | 20024:P.Effects[0].Condition.Operand | 现有 TargetProp 条件操作 NotEqual |
| parameter.BuffCount:Special_CH0231_ExtraPassive | partial | 5 | 10087:P.Effects[1].Condition.Parameter | 使用 BuffCount 的 Special_CH0231_ExtraPassive 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.BuffCount:Special_LittleDevil | partial | 2 | 10032:P.Effects[1].Condition.Parameter | 使用 BuffCount 的 Special_LittleDevil 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.SkillLevel:ExtraPassive | partial | 7 | 10099:E.Effects[0].Condition.Parameter | 使用 SkillLevel 的 ExtraPassive 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:CH0187Mod | partial | 3 | 10062:G.Effects[0].Condition.Parameter | 使用 Special 的 CH0187Mod 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:CH0224_Public | partial | 5 | 10082:E.Effects[0].Condition.Parameter | 使用 Special 的 CH0224_Public 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:CH0239_ExtraPassive | partial | 3 | 10088:E.Effects[0].Condition.Parameter | 使用 Special 的 CH0239_ExtraPassive 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:CH0280_Ex_01 | partial | 11 | 10111:E.ExtraSkills[0].Effects[0].Condition.Parameter | 使用 Special 的 CH0280_Ex_01 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:FormChange | partial | 3 | 10051:P.Effects[0].Condition.Parameter | 使用 Special 的 FormChange 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.Special:Fury | partial | 3 | 10008:E.Effects[0].Condition.Parameter | 使用 Special 的 Fury 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.TargetProp:ArmorType | partial | 3 | 10061:EP.Effects[0].Condition.Parameter | 使用 TargetProp 的 ArmorType 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.TargetProp:Id | partial | 2 | 10016:G.Effects[1].Condition.Parameter | 使用 TargetProp 的 Id 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.TargetProp:School | partial | 3 | 20024:P.Effects[0].Condition.Parameter | 使用 TargetProp 的 School 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| parameter.TargetProp:Size | partial | 6 | 10011:EP.Effects[0].Condition.Parameter | 使用 TargetProp 的 Size 字段规则；限制：保持当前条件路径；Size 等缺失外部属性目前会放行，尚不保证人工事实完整验证 |
| special.(none) | state_only | 8 | 10017:P.Effects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.AllDamageCountsAsEx | state_only | 2 | 10134:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.AmplifyDoTAdditionalTick_Poison | state_only | 2 | 10104:E.Effects[2].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.AmplifyDoTReducePeriod_Chill | state_only | 2 | 10104:E.Effects[1].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CH0187Mod | state_only | 2 | 10062:E.Effects[4].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CH0220_Public | partial | 17 | 10091:E.Effects[1].Key | 使用共享乐队层数配置维护计数、衰减、累计授予及倍率；限制：衰减/累计授予审计、封顶溢出贡献及活动效果移除后的计数一致性仍待完整生命周期验收 |
| special.CH0221_ExtraPassive | partial | 2 | band.grants[0].targetKey | 使用共享乐队层数配置维护计数、衰减、累计授予及倍率；限制：衰减/累计授予审计、封顶溢出贡献及活动效果移除后的计数一致性仍待完整生命周期验收 |
| special.CH0224_Public | state_only | 2 | 10082:G.Effects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CH0239_ExtraPassive | state_only | 2 | 10088:EP.Effects[1].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CH0280_Ex_01 | partial | 2 | 10111:E.Effects[0].Key | 维护状态并提供登记的形态解锁/时长参数；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CH0309_Ex | state_only | 2 | 10130:P.Effects[1].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.CostOverload | partial | 1 | catalog.policies.specials.CostOverload | 维护 EX 借费额度、负 Cost 余额及还款审计；限制：沿用现有满编约束与借费实现；不代表全部触发、驱散及外部战况语义均已验收 |
| special.EnergyBatteryHalf | state_only | 2 | 10015:G.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.FormChange | partial | 13 | 10011:E.Effects[0].Key | 维护状态并提供登记的形态解锁/时长参数；限制：不代表该技能所有后续战斗影响已经实现 |
| special.Fury | state_only | 3 | 10008:G.Effects[1].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.GuaranteedCritical | state_only | 3 | 10059:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.IgnoreDefense | state_only | 2 | 10099:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.NormalAttackAreaOverride_CasualSena | state_only | 2 | 10113:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.NormalAttackAreaOverride_Shigure | state_only | 2 | 10055:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.NormalAttackOverride_MaidAris | state_only | 2 | 10066:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.NormalDamageScalesWithExBuff | state_only | 2 | 16020:EP.syntheticEffects[0].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| special.SilverBullet | state_only | 2 | 10061:E.Effects[2].Key | 保存特殊状态及审计；限制：不代表该技能所有后续战斗影响已经实现 |
| stat.AccuracyPoint_Base | state_only | 9 | 10006:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AccuracyPoint_Coefficient | state_only | 26 | 10003:P.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AmmoCount_Base | state_only | 2 | 10013:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AttackPower_Base | state_only | 95 | 10004:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AttackPower_Coefficient | state_only | 277 | 10002:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AttackSpeed_Base | state_only | 11 | 10007:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.AttackSpeed_Coefficient | state_only | 74 | 10004:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.BlockRate_Base | state_only | 2 | 13010:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.ChillDamagedIncrease_Coefficient | state_only | 2 | 10101:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalChanceResistPoint_Coefficient | state_only | 14 | 10058:EP.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalDamageRate_Base | state_only | 34 | 10000:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalDamageRate_Coefficient | state_only | 109 | 10000:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalDamageResistRate_Base | state_only | 2 | 10005:G.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalDamageResistRate_Coefficient | state_only | 19 | 10017:P.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalPoint_Base | state_only | 2 | 26007:E.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalPoint_BaseOuter | state_only | 17 | 10010:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.CriticalPoint_Coefficient | state_only | 54 | 10000:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DamagedRatio2_Coefficient | state_only | 8 | 10038:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DamageRatio2_Coefficient | state_only | 5 | 10059:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DefensePenetration_Base | state_only | 8 | 10032:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DefensePower_Base | state_only | 9 | 10005:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DefensePower_Coefficient | state_only | 71 | 10005:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DodgePoint_Base | state_only | 5 | 10050:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.DodgePoint_Coefficient | state_only | 31 | 10008:G.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhanceBasicsDamageRate_Base | state_only | 3 | 10129:E.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhanceExDamageRate_Base | state_only | 8 | 10107:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhanceExplosionRate_Base | state_only | 21 | 10045:E.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhanceMysticRate_Base | state_only | 15 | 10027:G.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhancePierceRate_Base | state_only | 17 | 10056:E.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.EnhanceSonicRate_Base | state_only | 18 | 10077:P.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.ExtendBuffDuration_Base | state_only | 22 | 10064:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.ExtendDebuffDuration_Base | state_only | 7 | 10072:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.ExtendDebuffDuration_Coefficient | state_only | 2 | 10052:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.HealEffectivenessRate_Base | state_only | 3 | 10001:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.HealEffectivenessRate_Coefficient | state_only | 18 | 10001:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.HealPower_Base | state_only | 36 | 10042:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.HealPower_Coefficient | state_only | 44 | 10020:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.IgnoreDelayCount_Base | state_only | 7 | 10044:E.Effects[2].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.MaxHP_Base | state_only | 47 | 10002:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.MaxHP_Coefficient | state_only | 43 | 10002:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.MoveSpeed_Coefficient | state_only | 6 | 10013:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.OppressionPower_Base | state_only | 5 | 10022:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.OppressionPower_Coefficient | state_only | 7 | 10080:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.OppressionResist_Coefficient | state_only | 5 | 10001:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.Range_Base | state_only | 10 | 10069:PS.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.Range_Coefficient | state_only | 5 | 10011:E.Effects[1].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.ReduceWeakDamagedRate_Base | state_only | 4 | 10133:EP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| stat.RegenCost_Base | implemented | 15 | 10003:EP.Effects[0].Stat | 参与 Cost 回复计算 |
| stat.RegenCost_Coefficient | implemented | 9 | 20020:EP.Effects[0].Stat | 参与 Cost 回复计算 |
| stat.StabilityPoint_Base | state_only | 4 | 16006:WP.Effects[0].Stat | 保存为活动属性修正器；限制：不承诺将属性修正反馈到真实伤害、动作或血量计算 |
| target.Ally | implemented | 105 | 10016:G.Effects[0].Target[0] | 按现有选择器解析 Ally；Enemy 仅为占位目标 |
| target.AllyMain | implemented | 207 | 10016:G.Effects[2].Target[0] | 按现有选择器解析 AllyMain；Enemy 仅为占位目标 |
| target.AllySupport | implemented | 102 | 10072:EP.Effects[1].Target[0] | 按现有选择器解析 AllySupport；Enemy 仅为占位目标 |
| target.Any | implemented | 11 | 10020:E.Effects[1].Target[0] | 按现有选择器解析 Any；Enemy 仅为占位目标 |
| target.Enemy | implemented | 105 | 10003:P.Effects[0].Target[0] | 按现有选择器解析 Enemy；Enemy 仅为占位目标 |
| target.Self | implemented | 1059 | 10000:EP.Effects[0].Target[0] | 按现有选择器解析 Self；Enemy 仅为占位目标 |
| trigger.linked.self_ex | implemented | 2 | 10045:EP.trigger.linked.self_ex | 关联自身 EX Buff 的生效与失效 |
| trigger.manual.ex | manual_fact | 273 | 10000:E.trigger.manual.ex | 用户插入 EX 事实；限制：本步不新增来源或时序验证 |
| trigger.manual.extra_ex | manual_fact | 22 | 10062:E.ExtraSkills[0].trigger.manual.extra_ex | 用户选择变体技能并满足现有形态校验；限制：深层变体仅登记路径；不扩展现有 SkillRef 的可执行范围 |
| trigger.manual.extra_passive | manual_fact | 273 | 10000:EP.trigger.manual.extra_passive | 用户选择额外被动触发事实；限制：人工原因与外部条件尚未完整验证 |
| trigger.manual.public | manual_fact | 339 | 10000:G.trigger.manual.public | 用户选择公共技能触发时机；限制：概率、随机目标及外部事件验证尚未完整闭环 |
| trigger.ns.attack_count | partial | 22 | 10014:P.trigger.ns.attack_count | 按显式普攻次数在 UI 排轴；限制：NS 自身打断被忽略；不是完整动作事件账本，见 B02 |
| trigger.ns.interval | partial | 269 | 10000:G.trigger.ns.interval | 按显式秒数在 UI 排轴；限制：引擎不验证自动触发依据与时机，见 B02 |
| trigger.opening.passive | implemented | 545 | 10000:PS.trigger.opening.passive | 沿用强化/专武开局效果 |
| trigger.opening.rule | partial | 126 | 10011:P.trigger.opening.rule | 按开局规则选取效果、合成状态或初始 Cost；限制：含部分仅记录状态的能力；10144 仍按满编 6 人折算且未处理抑制条件 |
