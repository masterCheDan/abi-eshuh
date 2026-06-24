import { useMemo } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useI18n } from '../../i18n'

/** 帧 → 三种时间格式（30fps） */
function formatTimeFrame(totalFrames: number): { mmssms: string; secFrame: string } {
  const f = totalFrames % 30                     // 秒内帧
  const totalSeconds = Math.floor(totalFrames / 30)
  const ms = Math.round((totalFrames / 30 - totalSeconds) * 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60

  const sMs = String(ms).padStart(3, '0')
  const ss = String(s).padStart(2, '0')

  return {
    mmssms: `${m}:${ss}.${sMs}`,
    secFrame: `${m}:${ss}第${f}帧`,
  }
}

export function EventLog() {
  const { t } = useI18n()
  const lanes = useTimelineStore((s) => s.lanes)

  // ── 收集所有 EX 事件，按帧排序 ──
  const events = useMemo(() => {
    const list: {
      frame: number
      skillName: string
      casterName: string
      targetName: string
    }[] = []

    const idToName = new Map<number, string>()
    for (const lane of lanes) {
      if (lane.student) {
        idToName.set(lane.student.Id, lane.student.Name)
      }
    }

    for (const lane of lanes) {
      const caster = lane.student
      if (!caster) continue

      for (const skill of lane.skills) {
        if (skill.type !== 'ex') continue

        const targetId = skill.targetId ?? skill.studentId
        list.push({
          frame: skill.startFrame,
          skillName: skill.name,
          casterName: caster.Name,
          // 未指定目标（targetId == studentId）→ 占位符
          targetName: targetId === skill.studentId
            ? t.event_log.target_boss
            : (idToName.get(targetId) ?? `ID:${targetId}`),
        })
      }
    }

    list.sort((a, b) => a.frame - b.frame)
    return list
  }, [lanes])

  return (
    <div className="rounded-lg overflow-hidden flex flex-col h-full border" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
      {/* 标题栏 */}
      <div className="px-3 py-1.5 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t.event_log.title}</span>
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-gray-600">{t.event_log.empty}</span>
          </div>
        ) : (
          events.map((ev, i) => {
            const time = formatTimeFrame(ev.frame)
            const isBoss = ev.targetName === t.event_log.target_boss
            return (
              <div
                key={i}
                className="bg-gray-800/40 border border-gray-700/60 rounded px-2.5 py-1.5 hover:border-gray-600/80 transition-colors"
              >
                {/* 第一行：序号 + 时间信息 */}
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[10px] font-bold text-gray-500 shrink-0">
                    #{i + 1}
                  </span>
                  <span className="text-[11px] text-gray-300 font-mono font-medium">
                    {time.mmssms}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono">
                    {ev.frame}F
                  </span>
                  <span className="text-[9px] text-gray-600 font-mono ml-auto">
                    {time.secFrame}
                  </span>
                </div>

                {/* 第二行：释放者 → 目标  + 技能名 */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-gray-200 truncate font-medium">
                    {ev.casterName}
                  </span>
                  <span className="text-gray-600 shrink-0">→</span>
                  <span className={`truncate ${isBoss ? 'text-red-400/80' : 'text-gray-300'}`}>
                    {ev.targetName}
                  </span>
                  <span className="text-[9px] text-gray-500 ml-auto shrink-0 truncate max-w-[70px]">
                    {ev.skillName}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
