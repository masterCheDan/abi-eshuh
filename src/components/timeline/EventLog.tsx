import { useMemo } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useI18n } from '../../i18n'
import { SkillIcon } from '../skill-panel/SkillIcon'
import type { BulletType } from '../../types/student'

function formatTime(totalFrames: number): { ms: string; frame: string } {
  const f = totalFrames % 30
  const totalSeconds = Math.floor(totalFrames / 30)
  const ms = Math.round((totalFrames / 30 - totalSeconds) * 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  const ss = String(s).padStart(2, '0')
  return {
    ms: `${m}:${ss}.${String(ms).padStart(3, '0')}`,
    frame: `${m}:${ss} 第${f}帧`,
  }
}

export function EventLog() {
  const { t } = useI18n()
  const lanes = useTimelineStore((s) => s.lanes)

  const events = useMemo(() => {
    type Ev = {
      frame: number; skillName: string; skillIcon: string; bulletType: BulletType
      casterName: string; casterIcon: string
      targetName: string; targetIcon: string
      isBoss: boolean
    }

    const list: Ev[] = []
    const idToInfo = new Map<number, { name: string; icon: string }>()
    for (const lane of lanes) {
      if (lane.student) idToInfo.set(lane.student.Id, { name: lane.student.Name, icon: lane.student.Icon })
    }

    for (const lane of lanes) {
      const caster = lane.student
      if (!caster) continue
      for (const skill of lane.skills) {
        if (skill.type !== 'ex') continue
        const targetId = skill.targetId ?? skill.studentId
        const target = idToInfo.get(targetId)
        const isBoss = !target || targetId === skill.studentId
        list.push({
          frame: skill.startFrame,
          skillName: skill.name,
          skillIcon: caster.Skills.E.Icon,
          bulletType: caster.BulletType,
          casterName: caster.Name,
          casterIcon: caster.Icon,
          targetName: isBoss ? t.event_log.target_boss : target!.name,
          targetIcon: isBoss ? '' : target!.icon,
          isBoss,
        })
      }
    }
    list.sort((a, b) => a.frame - b.frame)
    return list
  }, [lanes])

  const DOT_SIZE = 12
  const LINE_WIDTH = 2
  const LINE_LEFT = 14

  return (
    <div className="rounded-lg overflow-hidden flex flex-col h-full border" style={{ background: 'var(--bg-app)', borderColor: 'var(--border)' }}>
      <div className="px-3 py-1.5 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t.event_log.title}</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-gray-600">{t.event_log.empty}</span>
          </div>
        ) : (
          <div className="relative pl-10 pr-2 py-3">
            {/* 竖线 */}
            <div
              className="absolute bg-gray-700/60 rounded-full"
              style={{ left: LINE_LEFT - LINE_WIDTH / 2, top: 0, bottom: 0, width: LINE_WIDTH }}
            />

            {events.map((ev, i) => (
              <div key={i} className="relative mb-5 last:mb-0">
                {/* ── 节点 + 时间（同行）── */}
                <div className="flex items-center gap-2">
                  {/* 圆点 */}
                  <div
                    className="absolute rounded-full border-2 z-10"
                    style={{
                      left: -(LINE_LEFT + DOT_SIZE),
                      top: 6,
                      width: DOT_SIZE,
                      height: DOT_SIZE,
                      background: ev.isBoss ? '#ef4444' : 'var(--bg-surface)',
                      borderColor: ev.isBoss ? '#ef4444' : 'var(--border)',
                    }}
                  />
                  {/* 时间（大字） */}
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatTime(ev.frame).ms}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      ({formatTime(ev.frame).frame})
                    </span>
                  </div>
                </div>

                {/* ── 小卡片：头像 → 技能图标 → 箭头 → 目标头像 ── */}
                <div
                  className="ml-4 mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  {/* 释放者头像 */}
                  <img
                    src={`/icons/${ev.casterIcon}.webp`}
                    alt={ev.casterName}
                    className="w-5 h-5 rounded-full shrink-0 bg-gray-700"
                    title={ev.casterName}
                  />
                  {/* 技能图标 */}
                  {ev.skillIcon && (
                    <SkillIcon icon={ev.skillIcon} bulletType={ev.bulletType} size={18} />
                  )}
                  {/* 箭头 */}
                  <span className="text-gray-500 text-xs shrink-0">→</span>
                  {/* 目标头像 */}
                  {ev.isBoss ? (
                    <span className="text-[10px] font-bold text-red-400 px-1">Boss</span>
                  ) : (
                    <img
                      src={`/icons/${ev.targetIcon}.webp`}
                      alt={ev.targetName}
                      className="w-5 h-5 rounded-full shrink-0 bg-gray-700"
                      title={ev.targetName}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

