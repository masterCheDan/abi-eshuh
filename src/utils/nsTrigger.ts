/**
 * NS 触发判定模块
 *
 * 职责：在每次普攻命中后，判定是否应触发 NS 技能。
 *
 * 触发流程：
 *   NORMAL_ATTACK_HIT
 *     → 检查 Condition（如有）
 *     → 检查触发概率（TODO: 随机数判定）
 *     → 返回 shouldTrigger
 *
 * 条件类型（Condition 对象）：
 *   - BuffCount  : 检查指定 Buff 的叠层数是否在范围内
 *   - FormChange : 检查变形形态是否存在
 *   - TargetProp : 检查目标属性（Size / School 等）
 *   - SkillLevel : 检查指定技能等级范围
 *
 * 概率触发（预留接口）：
 *   255/264 学生的 NS 仅有概率触发（无条件）。
 *   概率值储存在 Parameters[0] = [Lv1%, Lv2%, ..., Lv10%]。
 *   暂不实现随机判定。
 */

import type { Student, PublicSkill } from '../types/student'

// ═══════════════════════════════════════════════════
// 暴露接口
// ═══════════════════════════════════════════════════

export interface NsTriggerContext {
    /** 当前学生 */
    student: Student
    /** 当前帧 */
    frame: number
    /** 累计普攻命中次数 */
    attackCount: number
    /** 当前弹药序号（1-based, 用于部分条件判定） */
    shotIndex: number
    /**
     * Buff 叠层查询（预留）
     * key = Buff 标签（如 "Special_LittleDevil"）
     * value = 当前层数
     */
    buffStacks?: Record<string, number>
}

export interface NsTriggerResult {
    /** 是否满足触发条件 */
    shouldTrigger: boolean
    /** 未触发的原因（调试用） */
    reason?: string
    /** 触发概率（如已知） */
    chance?: number
}

// ═══════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════

export function checkNsTrigger(ctx: NsTriggerContext): NsTriggerResult {
    const ns = getNsSkill(ctx.student)
    if (!ns) return { shouldTrigger: false, reason: 'no NS skill' }

    // ── 第 1 步：检查 Condition（若有） ──
    for (const ef of ns.Effects) {
        if (ef.Condition) {
            const condResult = evaluateCondition(ef.Condition, ctx)
            if (!condResult.passed) {
                return { shouldTrigger: false, reason: condResult.reason }
            }
        }
    }

    // ── 第 2 步：检查触发概率（预留接口） ──
    // const chance = getNsTriggerChance(ns, 1) // TODO: 读取学生技能等级
    // if (Math.random() * 100 > chance) {
    //   return { shouldTrigger: false, reason: '概率未通过' }
    // }

    // ── 条件满足（概率判定暂跳过，视为通过） ──
    return { shouldTrigger: true, reason: '条件满足' }
}

// ═══════════════════════════════════════════════════
// 条件判定器
// ═══════════════════════════════════════════════════

interface ConditionObject {
    Type: string
    Parameter?: string
    Operand?: string
    Value?: unknown
}

interface ConditionResult {
    passed: boolean
    reason: string
}

function evaluateCondition(
    condition: unknown,
    ctx: NsTriggerContext,
): ConditionResult {
    if (typeof condition === 'string') {
        // 字符串类型条件（预留）—— 暂视为通过
        return { passed: true, reason: `string condition: ${condition}` }
    }

    const cond = condition as ConditionObject
    switch (cond.Type) {
        case 'BuffCount':
            return evaluateBuffCount(cond, ctx)
        case 'TargetProp':
            return evaluateTargetProp(cond)
        case 'SkillLevel':
            // SkillLevel 依赖学生自身技能等级——无条件通过（无法获取等级）
            return { passed: true, reason: `技能等级条件: ${cond.Parameter} (无法判定, 视为通过)` }
        case 'Special':
            if (cond.Parameter === 'FormChange') {
                return evaluateFormChange(cond)
            }
            // 其他 Special 条件 —— 无法判定, 视为通过
            return { passed: true, reason: `Special条件: ${cond.Parameter} (无法判定, 视为通过)` }
        default:
            return { passed: false, reason: `未知条件类型: ${cond.Type}` }
    }
}

/** BuffCount: 检查 Buff 叠层数是否在 [Value[0], Value[1]] 范围内 */
function evaluateBuffCount(cond: ConditionObject, ctx: NsTriggerContext): ConditionResult {
    const buffName = cond.Parameter ?? ''
    const range = cond.Value as number[] | undefined
    const [lo, hi] = range ?? [0, Infinity]

    // 从 ctx.buffStacks 查询（如提供）
    const stacks = ctx.buffStacks?.[buffName] ?? 0
    if (stacks >= lo && stacks <= hi) {
        return { passed: true, reason: `${buffName} 叠层 ${stacks} ∈ [${lo},${hi}]` }
    }
    return { passed: false, reason: `${buffName} 叠层 ${stacks} ∉ [${lo},${hi}]` }
}

/** FormChange: 检查变形形态是否存在 */
function evaluateFormChange(cond: ConditionObject): ConditionResult {
    const operand = cond.Operand ?? 'Exists'
    const value = cond.Value

    if (operand === 'Exists') {
        // FormChange 存在 = 条件通过/不通过取决于 value
        return value === false
            ? { passed: false, reason: '变形形态存在(FormChange), 条件要求不存在' }
            : { passed: true, reason: '变形形态存在' }
    }

    return { passed: true, reason: `FormChange operand=${operand} (无法精确判定)` }
}

/** TargetProp: 检查目标属性 */
function evaluateTargetProp(cond: ConditionObject): ConditionResult {
    const prop = cond.Parameter ?? ''
    const operand = cond.Operand ?? 'Equal'
    const value = cond.Value

    // 目标属性在设计期无法确定 —— 视为通过
    return {
        passed: true,
        reason: `TargetProp: ${prop} ${operand} ${value} (设计期无法判定, 视为通过)`,
    }
}

// ═══════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════

/**
 * 获取学生的 NS 技能
 * - HasGear=true 时使用 Skills.G（换装后的 NS）
 * - 否则使用 Skills.P（常规 NS）
 */
export function getNsSkill(s: Student): PublicSkill | null {
    return s.HasGear ? s.Skills.G : s.Skills.P
}

/**
 * 获取 NS 触发概率（预留接口）
 *
 * @param ns      NS 技能对象
 * @param level   技能等级（1-10）
 * @returns       触发概率百分比（如 18.9% 返回 18.9）
 */
export function getNsTriggerChance(ns: PublicSkill, level: number): number {
    const probs = ns.Parameters?.[0]
    if (!probs || probs.length === 0) return 100
    const idx = Math.max(0, Math.min(level - 1, probs.length - 1))
    const raw = probs[idx]
    return parseFloat(raw.replace('%', '')) || 100
}

/**
 * 获取 NS 动画时长（帧）
 */
export function getNsDuration(ns: PublicSkill): number {
    return ns.Duration || 60
}
