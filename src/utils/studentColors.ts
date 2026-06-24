/**
 * 学生专属颜色工具
 * 根据 slotIndex 分配固定色相，技能块 / Buff 条均从此派生
 */

/** 10 种互不相同的色相（对应最多 10 个编队位置） */
const STUDENT_HUES = [
  { hue: 210, name: 'blue' },       // 前排 1
  { hue: 340, name: 'rose' },       // 前排 2
  { hue: 140, name: 'green' },      // 前排 3
  { hue: 30,  name: 'orange' },     // 前排 4
  { hue: 270, name: 'violet' },     // 前排 5
  { hue: 180, name: 'teal' },       // 前排 6
  { hue: 50,  name: 'gold' },       // 后排 1
  { hue: 310, name: 'pink' },       // 后排 2
  { hue: 80,  name: 'lime' },       // 后排 3
  { hue: 0,   name: 'red' },        // 后排 4
] as const

/** 按 slotIndex 获取色相值 (0-360) */
export function getStudentHue(slotIndex: number): number {
  return STUDENT_HUES[slotIndex % STUDENT_HUES.length].hue
}

/** 获取色相名称（调试用） */
export function getStudentColorName(slotIndex: number): string {
  return STUDENT_HUES[slotIndex % STUDENT_HUES.length].name
}

export interface StudentSkillColors {
  /** 前摇段 class（含透明度 + 左边框） */
  preCast: string
  /** 生效段 class */
  active: string
  /** 后效段 class */
  after: string
  /** 标签 / 文字颜色 */
  label: string
}

/** 从 slotIndex 生成技能块样式 */
export function studentSkillStyles(
  slotIndex: number,
  opacity = 1,
  /** 伤害技能强调生效段，辅助技能强调前摇段 */
  damage = false,
): {
  preStyle: React.CSSProperties
  activeStyle: React.CSSProperties
  afterStyle: React.CSSProperties
  labelClass: string
} {
  const h = getStudentHue(slotIndex)
  const heavy = { alpha: 0.65, border: true }
  const light = { alpha: 0.25, border: false }
  const vLight = { alpha: 0.12, border: false }

  const [preAlpha, activeAlpha] = damage
    ? [light.alpha, heavy.alpha]
    : [heavy.alpha, light.alpha]

  return {
    preStyle: {
      backgroundColor: `hsla(${h}, 70%, 45%, ${preAlpha * opacity})`,
      ...(damage ? {} : { borderLeft: `2px solid hsl(${h}, 70%, 60%)` }),
    },
    activeStyle: {
      backgroundColor: `hsla(${h}, 70%, 50%, ${activeAlpha * opacity})`,
      ...(damage ? { borderLeft: `2px solid hsl(${h}, 70%, 60%)` } : {}),
    },
    afterStyle: {
      backgroundColor: `hsla(${h}, 70%, 40%, ${vLight.alpha * opacity})`,
      borderRight: `1px dashed hsla(${h}, 70%, 55%, 0.4)`,
    },
    labelClass: '',
  }
}

/** 从 slotIndex 生成 Buff 条样式 */
export function studentBuffStyle(slotIndex: number, overridden = false): React.CSSProperties {
  if (overridden) {
    return {
      backgroundColor: 'hsla(0, 0%, 40%, 0.18)',
      borderLeft: '1px solid hsla(0, 0%, 40%, 0.3)',
    }
  }
  const h = getStudentHue(slotIndex)
  return {
    backgroundColor: `hsla(${h}, 65%, 45%, 0.35)`,
    borderLeft: `2px solid hsl(${h}, 65%, 50%)`,
  }
}
