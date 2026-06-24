/**
 * 分享码版本 0.0.1
 *
 * 格式：
 *   版本号 | 学生ID数组(逗号分隔,空=-1) | 帧,释放者索引,目标索引;
 *
 * 例：
 *   0.0.1|10000,-1,10006,10012,-1,-1|2720,0,-1;3750,2,0;
 */

import type { StudentLane, SkillBlock } from '../../types/timeline'

export const VERSION = '0.0.1'

function findSlotByStudentId(lanes: StudentLane[], studentId: number): number {
  for (const l of lanes) {
    if (l.student?.Id === studentId) return l.slotIndex
  }
  return -1
}

/** 编码 → 原始字符串 */
export function encode(lanes: StudentLane[]): string {
  // 1. 按 slotIndex 顺序输出学生 ID
  const sortedSlots = lanes.map(l => l.slotIndex).sort((a, b) => a - b)
  const studentIds = sortedSlots.map(si => {
    const lane = lanes.find(l => l.slotIndex === si)
    return lane?.student?.Id ?? -1
  })

  // 2. 收集 EX 事件
  const events: { frame: number; casterSlot: number; targetId: number }[] = []
  for (const l of lanes) {
    for (const s of l.skills) {
      if (s.type !== 'ex') continue
      events.push({
        frame: s.startFrame,
        casterSlot: l.slotIndex,
        targetId: s.targetId ?? -1,
      })
    }
  }
  events.sort((a, b) => a.frame - b.frame)

  // 3. 编码
  const eventParts = events.map(ev =>
    `${ev.frame},${ev.casterSlot},${findSlotByStudentId(lanes, ev.targetId)}`
  )

  return [VERSION, studentIds.join(','), eventParts.join(';')].join('|')
}

/**
 * 解码 → 结构化的导入数据
 * 返回 null 表示解析失败
 */
export function decode(raw: string): ImportData | null {
  try {
    const parts = raw.split('|')
    if (parts.length !== 3) return null
    if (parts[0] !== VERSION) return null

    const idList = parts[1].split(',').map(v => parseInt(v))
    const skills: ImportEvent[] = []

    if (parts[2]) {
      for (const evStr of parts[2].split(';')) {
        if (!evStr) continue
        const [f, c, t] = evStr.split(',').map(v => parseInt(v))
        skills.push({ frame: f, casterSlot: c, targetSlot: t })
      }
    }

    return { studentIds: idList, skills }
  } catch {
    return null
  }
}

/* ── 导出类型 ── */

/** 导入数据结构 */
export interface ImportData {
  /** 按 slotIndex 顺序的学生 ID 数组 */
  studentIds: number[]
  /** 技能事件 */
  skills: ImportEvent[]
}

export interface ImportEvent {
  frame: number
  casterSlot: number
  /** -1 = Boss, 其他 = 队友 slotIndex */
  targetSlot: number
}
