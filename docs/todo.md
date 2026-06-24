# 🎯 排轴工具开发 TODO

> 从零搭建一个「碧蓝档案」战斗排轴工具

---

## 🏛️ 核心设计原则

### 只存储事实，不存储推导结果

**事件仅包含三个字段：**

- 释放时间（Frame）
- 释放学生（Caster）
- 释放目标（Target）

**时间轴结构包含：**

| 字段 | 说明 |
|------|------|
| `Version` | 版本号，用于未来兼容升级 |
| `RaidId` | 副本 ID（总力战 / 大决战 / 其他战斗场景） |
| `Team` | 当前编队学生列表 |
| `Events` | 所有 EX 释放事件列表 |

### 分享码中不保存以下内容（全部由程序自动推导）

| 不保存 | 推导来源 |
|--------|----------|
| ~~NS~~ | 学生数据库 `Skills.Public` / `Skills.GearPublic` → 根据 CD 时间自动插入 |
| ~~SS~~ | 学生数据库 `Skills.ExtraPassive` → 常驻被动，按条件触发 |
| ~~Buff~~ | 学生数据库 Effects → 解析 Type / Duration / Stat |
| ~~Debuff~~ | 同上，Effect Type 为 Buff 且 Target 为 Enemy |
| ~~Cost 变化~~ | EX 技能 `Cost` 数组 + 自然回复速度 `Regen` → 自动计算 |
| ~~技能前摇~~ | Effect `ApplyFrame` → 推导 |
| ~~技能后摇~~ | `Duration - ApplyFrame` → 推导 |
| ~~多段伤害~~ | Effect `Hits` + `Period` → 推导 |
| ~~Boss 机制覆盖~~ | Boss 数据库 → 按 Phase 时间轴叠加 |
| ~~伤害计算结果~~ | ATK × Scale × 克制关系 → 推导 |

### 正确 vs 错误示例

```
✅ 正确：700帧 爱丽丝 释放EX → 目标Boss
❌ 错误：700帧 爱丽丝 释放EX
        790帧 第一段伤害
        810帧 第二段伤害
        830帧 第三段伤害
```

> 伤害段数、Buff 持续时间等全部根据技能数据库重新计算，不写入分享码。

### 用户只需录入

| 录入项 | 说明 |
|--------|------|
| 什么时候释放 EX | Frame |
| 由谁释放 EX | Caster |
| 对谁释放 EX | Target |

### 程序自动推导

| 推导项 | 数据来源 |
|--------|----------|
| 技能前摇 / 生效区间 | 学生数据库 `ApplyFrame` / `Duration` |
| 多段伤害时间点 | 学生数据库 `Hits` / `Period` |
| Buff / Debuff 覆盖区间 | 学生数据库 Effect `Duration` |
| NS / SS 触发时机 | 学生数据库 CD / 触发条件 |
| Cost 变化曲线 | EX Cost + 自然回复 `Regen` |
| Boss 机制关联 | Boss 数据库 Phase 时间轴 |

### 最终目标

生成**尽可能短**的分享码字符串，支持：

- 复制 / 分享 / 导入 / 导出
- 未来版本升级时仍能兼容旧分享码

---

## ✅ 已完成

- [x] Vite + React + TypeScript 项目初始化
- [x] Tailwind CSS 配置
- [x] 安装 zustand
- [x] Git 初始化 + GitHub 远程仓库（SSH）
- [x] README 完善
- [x] 学生数据结构定义（src/types/student.ts）
- [x] SchaleDB 数据精简（4.69MB → 0.92MB）
- [x] Zustand 学生数据 Store（加载/搜索/过滤）
- [x] 队伍配置面板（前后排位置 + 弹窗搜索）
- [x] 独立学生搜索组件（StudentSearch）/ 弹窗对话框
- [x] 技能组件面板（EX 技能展示 + 添加/拖拽按钮）
- [x] 时间轴基础框架（尺标 + 轨道 + 技能块渲染）
- [x] 时间轴拖拽添加 / 移动 / 删除技能块
- [x] 技能块按类型分色（EX蓝 / NS翠绿 / SS琥珀）
- [x] 重叠技能自动分行

## 📋 待完成

### 1. 时间轴事件模型重构

- [ ] `SkillBlock` 重命名为 `TimelineEvent`，仅含 Frame / Caster / Target
- [ ] 移除 NS / SS 的手动添加入口（改为自动推导）
- [ ] `TimelineState` 增加 Version / RaidId / Team / Events 字段
- [ ] 从学生数据库推导 NS / SS 触发节点并叠加到时间轴

### 2. 效果自动推导引擎

- [ ] 解析 EX 技能 Effects，提取 Buff / Debuff / CC / Shield / Regen / DoT 等
- [ ] 根据 `ApplyFrame` + `Duration` 计算效果覆盖区间
- [ ] 根据 `Hits` + `Period` 计算多段伤害时间点
- [ ] 在时间轴上渲染效果持续条（与主技能块不同层级）

### 3. Cost 曲线

- [ ] 作为时间轴顶部的独立轨道，绘制 Cost 随时间变化的折线图
- [ ] 横轴为时间（帧），纵轴为 Cost 值
- [ ] 根据 EX 事件扣减 Cost + 自然回复速度自动推导

### 4. Boss 机制背景层

- [ ] Boss 不同阶段（Phase）用背景色块表示
- [ ] 转场 / 特殊状态用不同的色块 / 条纹表示
- [ ] 从 Boss 数据库读取机制数据，自动叠加到时间轴背景

### 5. NS / SS 自动推导显示

- [ ] NS 根据 Public / GearPublic 的 CD 周期自动在轨道上标记
- [ ] NS 以更细、更透明的线条显示
- [ ] SS (ExtraPassive) 以常驻标记显示
- [ ] 视觉权重明显低于 EX，但仍清晰可见

### 6. 分享码系统

- [ ] 设计最小化编码方案（事件列表 → 短字符串）
- [ ] 支持复制 / 分享 / 导入 / 导出
- [ ] 版本号机制，保证向前兼容
- [ ] 编队信息编入分享码

### 7. 持久化 & 优化

- [ ] 本地持久化（localStorage）
- [ ] 多方案管理（创建 / 切换 / 删除排轴方案）
