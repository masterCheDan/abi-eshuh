# **蔚蓝档案 (Blue Archive) 排轴器 \- 软件设计文档 (SDD)**

**版本:** v4.0 (最终全量合并版)

**状态:** 核心架构与全业务逻辑定稿 (Final Specification)

## **1\. 系统概述 (System Overview)**

本项目是一个基于 **React \+ TypeScript** 构建的纯前端单页应用 (SPA)，旨在为《蔚蓝档案》玩家提供一个精确到帧（60FPS/逻辑30FPS）的排轴与战斗模拟工具。核心目标是实现**确定性的状态机模拟**，输出可分享的 Base64 轴码与自然语言文本，并提供类似 Premiere Pro (PR) 非线性编辑软件的高密度可视化时间轴交互。

## **2\. 总体架构与数据流 (Architecture & Data Flow)**

系统强制遵循**单向数据流 (Unidirectional Data Flow)** 与**领域驱动设计 (DDD)**，核心模拟引擎与 UI 视图彻底解耦。

1. **领域模型层 (Engine / Model):** 纯 TS 实现的沙盒，无状态计算。接收用户的 Intent\[\]，产出包含时间线轨迹的最终报告 SimulationResult。**引擎不知道任何关于 UI（如颜色、折叠状态）的信息。**  
2. **视图状态层 (ViewModel / Zustand):** 接收 Engine 产出的 SimulationResult，将其映射转换为 UI 所需的数据结构（如具有 UUID、颜色、视觉截断标记的 TimelineBlock\[\]）。  
3. **UI 渲染层 (React):** 采用虚拟列表只读渲染 ViewModel，用户拖拽与点击交互转化为派发新的 Intent 写入指令源。

*核心数据流向:* UI 交互 \-\> 修改唯一指令源 (Intent List) \-\> 重置 Engine 并调用 simulate(Intents) \-\> 产出 SimulationResult \-\> Zustand ViewModel 映射 \-\> React 重新渲染。

## **3\. 核心引擎结构与 API 规范 (Engine Core)**

### **3.1 Engine API 门面 (Facade)**

引擎的交互接口极度精简，**唯一事实来源 (Single Source of Truth) 是 Intent List**。

class SimulationEngine {  
  // 初始化战场上下文 (根据 Boss 参数加载最大帧数与环境乘区)  
  public loadBattle(env: BattleEnv, formation: Formation): void;  
  // 执行全量推演 (无状态、纯函数性质)  
  public simulate(intents: Intent\[\]): SimulationResult;  
}

### **3.2 战斗实体有限状态机 (Pure FSM)**

每个学生实例维护一个纯粹的动作状态机，剥离了一切“等待/人工延迟”状态。

* **合法状态节点:** IDLE (待机), AA (普攻), NS (小技能), EX (大招), RELOAD (换弹), CC (受控)。  
* **合法转移规则:**  
  * IDLE \-\> 自然跳转至 AA, NS, RELOAD。  
  * CC / EX (用户指令) \-\> 最高优先级，强制打断任何动作。(打断 RELOAD 底层判定弹匣满，动作后摇被取消)。

### **3.3 触发器调度中心与偏移注入 (Trigger Scheduler & Override)**

负责跨实体的条件判定（时间型、自身状态型、全局事件型）与**人工校准延迟 (Offset Injection)**。

* 当触发器判定某角色的 NS 满足条件时，**调度器会去查询“人工校准表 (Override Table)”**。  
* 若存在人工微调设定的 \+15 帧延迟，调度器不会直接修改 FSM，而是将该 NS 触发事件挂起 (Queued)。15 帧后，调度器向 FSM 发送 \[Intent\_Trigger\_NS\]。FSM 接收指令并进行跳转，从而实现“黑盒物理延迟”的完美隔离。

### **3.4 滑动窗口与合法性检测 (Sliding Window Legality)**

针对日服“全技能顺序预设”机制，引擎内置手牌合法性检测：

* **常规 4+2 战斗:** 队列长度 6，滑动窗口（手牌）大小为 **3**。  
* **大决战 6+4 战斗:** 队列长度 10，滑动窗口大小为 **5**。  
* 验证：读取用户 EX\_CAST 指令时，若技能不在当前窗口内，标记为越界错误，但不阻断推演。

### **3.5 核心 Tick 执行流水线 (The Tick Pipeline)**

在 simulate() 周期中，每一帧 (frame) 必须**严格遵守**以下顺序：

1. **Clock Update:** currentFrame++  
2. **Buff/CC Update:** 结算费用自然回复、更新 Buff/Debuff/CC 持续时间。  
3. **FSM Tick:** 步进所有角色的动作帧，收集达标的 ActionTriggered 事件。  
4. **Trigger Scheduler:** 检查全局触发条件，处理延迟挂起队列中的系统技能。  
5. **Intent Resolve:** 收集本帧全部 Intent，验证滑动窗口合法性与 Cost。  
6. **Intent Priority Sort:** 稳定排序 (CC \> User\_EX \> System\_NS)。  
7. **FSM Apply:** 将合法 Intent 注入角色状态机发生跳转。  
8. **Logging:** 将本帧重要数据变化压入日志记录。

## **4\. 核心 TypeScript 契约 (Data Contracts)**

// 1\. 输入源: 意图定义  
interface Intent {  
  id: string;              // 唯一UUID，支持增删改查  
  frame: number;  
  type: 'EX\_CAST' | 'NS\_TRIGGER' | 'CC\_APPLY';  
  issuerId: number;  
  targetIds: number\[\];  
  priority: number;  
}

// 2\. 输出源: 引擎推演最终产物  
interface SimulationResult {  
  maxFrame: number;  
  costHistory: number\[\];         // 每帧Cost快照  
  actionLogs: ActionRecord\[\];    // 引擎输出的纯逻辑动作记录  
  errors: SimulationError\[\];  
}

// 3\. 逻辑记录 (无 UI 属性)  
interface ActionRecord {  
  recordId: string;  
  studentId: number;  
  actionType: 'AA' | 'NS' | 'EX' | 'RELOAD';  
  startFrame: number;  
  effectFrame: number;  
  endFrame: number;  
  wasInterrupted: boolean;  
  isManualOverride: boolean;  
}

// 4\. ViewModel (Store 衍生数据): UI 时间轴块  
interface TimelineBlock extends ActionRecord {  
  uiColor: string;               // 映射为 UI 渲染颜色  
  uiTrackIndex: number;  
  isVisuallyCut: boolean;        // 视觉打断截断效果  
}

## **5\. 确定性原则 (Determinism Rules) \- AI 编码天条**

为保证排轴结果的 100% 可复现，引擎实现必须遵循：

1. **绝对禁止不确定性 API:** 严禁使用 Math.random() 和 Date.now()。  
2. **规避浮点数 (Integer Only):** 时间标尺统一为整数 frame。Cost 计算采用放大整数模型（如 Cost \* 10000）。  
3. **稳定的遍历与环境:** 遍历实体必须按 Formation Index 固定顺序。严禁依赖 Object.keys() 导致环境差异。  
4. **稳定的排序策略 (Stable Sort):** 同帧处理冲突时，优先级相同必须按 Intent 插入次序兜底排序。  
5. **数据防篡改:** SimulationResult 内部嵌套对象必须深拷贝，严禁 React 意外 Mutation。

## **6\. 视觉化轨道布局与交互设计 (UI & UX)**

采用类似 Premiere Pro (PR) 的 **NLE（非线性编辑）风格时间轴视图**。原生 DOM 配合 @tanstack/react-virtual 渲染，拖拽交由 @dnd-kit 处理。

### **6.1 全局控制区 (吸顶悬浮)**

* **T0 \- 时间标尺 (Time Ruler):** 显示分秒与帧数，包含可拖动的**播放头 (Playhead)**。  
* **T1 \- 费用曲线 (Cost Track):** 贯穿轨道的阶梯/折线图。背景带有 0-10 整数阈值的横向虚线，关键回费节点处提供高亮标记。  
* **T2 \- Boss 轨道:** 标识 Boss 技能的前摇/判定区间色块；下半部叠印黄色的 CC 槽累计与衰减进度条。

### **6.2 角色操作区 (嵌套轨道组)**

6 名学生每人独占一个轨道组，支持两种形态：

* **【极简模式 / 折叠】:** 单行主轨道，仅展示显眼 **EX 技能块** 及背景 Buff 覆盖率色带。  
* **【FSM 详情模式 / 展开】:** 细分为三条子轨道：  
  * **Sub-T1 (动作轨道):** 核心排布区。用不同颜色标识 AA(灰)、NS(蓝)、Reload(橙纹)。  
    * **生效帧标记 (Keyframe):** 方块内部垂直高亮线映射 effect\_frame。  
    * **打断视觉呈现 (Visual Cut):** 若被 EX 打断，当前动作方块在视觉上被像剃刀般“直接切断”。  
  * **Sub-T2 (状态轨道):** 以悬浮线条展示 Buff/Debuff（如红线代表 ATK UP）。  
  * **Sub-T3 (触发器轨道):** 标识特定 SS (被动技能) 的触发帧。

### **6.3 提升体验的高级交互**

* **智能磁吸 (UI 开关):** 拖拽 EX 时，自动吸附至 Cost 整数节点、队友 Buff 生效帧或前移动作结束帧。  
* **画布缩放与平移:** 工作区悬停直接**纯鼠标滚轮缩放**，底部提供**原生横向滚动条**用于平移。  
* **越界爆红 (容错反馈):** 费用不足或未在手牌滑动窗口中的 EX 色块会即刻变为**红色警告纹理**，交由引擎全量重算告知后果，不生硬阻断操作。  
* **人工校准 (Offset Injection):** 允许用户在展开模式下，按住 Alt 向右拖动系统生成的 NS 方块，或右键呼出菜单精确输入延迟帧数。被校准的方块带有**锁/齿轮图标**。

## **7\. 学生检索与编队模块 (Student Selection)**

* **内存缓存:** 初始异步拉取 SchaleDB 精简元数据存入 Zustand，实现零延迟响应。  
* **多维度筛选:**  
  * 战术定位: 坦克、输出、治疗、辅助、T.S。  
  * 站位与队伍: 前卫、中卫、后卫 / Striker、Special。  
  * 护甲与攻击: 爆炸/贯通/神秘/振动，轻/重/特殊/弹性装甲。  
  * **学园 (School):** 阿拜多斯、格黑娜、千年、三一等。  
  * **武器类型 (Weapon):** SG, SMG, AR, GL, HG, SR, RG, MG, MT, RL。  
* **文本检索:** 匹配官方译名，并预留 alias.json 接口供社区后续扩充外号/黑话。

## **8\. 数据持久化与分享导出 (Persistence & Export)**

### **8.1 分享码结构规范 (Share Code)**

Base64 编码的序列化结构，分为 6 大部分：

1. **版本号 (Version):** 标识协议向下兼容 (如 "v1")。  
2. **战斗环境约束 (Environment):** 决定最大帧数与乘区 \[bossId, difficulty, armorType, terrain\]。  
3. **编队信息 (Formation):** 角色 ID 数组，支持空槽位 (null)。  
4. **全队列技能卡 (Full Deck Queue):** 记录开局完整队伍的卡牌预设顺序，支撑滑动窗口校验。  
5. **轴本体 (Timeline Actions):** 极简操作序列 "a b c"（帧数、角色标识、目标列表）。  
6. **微调与约束 (Overrides):** 包含核心的 **人工校准表 (Calibration Table)**。

*数据结构 JSON 示例 (编码前):*

{  
  "ver": "1",  
  "env": \[1001, 5, 2, 1\],  
  "form": \[10001, 10002, null, 10004, 20001, 20002\],  
  "init": \[0, 1, 4, 3, 5, 2\], // 全队列发牌顺序  
  "tl": \[  
    "900 0 \[0\]",  
    "1500 4 \[1, 2\]"  
  \],  
  "cfg": {  
    "override": \[{"charIdx": 1, "skill": "NS", "occurrence": 2, "offset": 15}\]  
  }  
}

### **8.2 自然语言文字轴导出 (Natural Language Export)**

系统遍历引擎输出报告，自动生成两套排版格式供玩家在社区 (NGA/B站) 一键复制分享：

* **模式 A（基于时间）:** \[MM:SS.ms\] 角色名 EX 指定 目标  
  * 示例：\[01:30.667\] 爱丽丝 EX 指定 左侧小兵  
* **模式 B（基于费用）:** \[X.XX Cost\] 角色名 EX 指定 目标  
  * 示例：\[9.00 Cost\] 爱丽丝 EX 指定 左侧小兵

## **9\. 目录结构约束 (Directory Structure)**

为保证 Vibe Coding 的代码纯净度，严禁跨层级耦合。

src/  
 ├─ engine/           \# 纯净领域层 (严禁引入 React)  
 │   ├─ core/         \# SimulationEngine, Tick Pipeline  
 │   ├─ model/        \# FSM, Entity  
 │   ├─ system/       \# Trigger Scheduler, Override Logic  
 ├─ store/            \# ViewModel (Zustand), 转换 SimulationResult  
 ├─ ui/               \# 纯渲染层 (React \+ Tailwind)  
 │   ├─ timeline/     \# Virtual List, dnd-kit, Tracks  
 │   ├─ components/   \# ContextMenu, Drawer  
 ├─ data/             \# SchaleDB 解析与缓存  
 ├─ utils/            \# 分享码与文本导出逻辑

*文档更新日志:*

* v4.0 (Final): 全量无损合并版本。找回并详述了 UI 轨道拆解、学生检索全量筛选维度、分享码详细 JSON 结构、滑动窗口校验逻辑及双模式自然语言文字轴导出功能，与纯净的 Engine 架构和确定性原则完成了终极融合。