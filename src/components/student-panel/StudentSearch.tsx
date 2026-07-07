import { useState, useMemo, useRef, useCallback } from 'react'
import { useStudentStore } from '../../stores/useStudentStore'
import type { Student, SquadType, School, BulletType, ArmorType, WeaponType } from '../../types/student'
import { useI18n, tpl } from '../../i18n'

export interface StudentSearchProps {
  squadType?: SquadType
  excludeIds?: number[]
  onSelect: (student: Student) => void
}

// ═══ 学校配置（含主题色） ═══
const SCHOOLS: { key: School | ''; label: string; color: string }[] = [
  { key: 'Abydos', label: '阿比多斯', color: '#eab308' },
  { key: 'Gehenna', label: '格黑娜', color: '#ef4444' },
  { key: 'Millennium', label: '千禧年', color: '#3b82f6' },
  { key: 'Trinity', label: '三一', color: '#a855f7' },
  { key: 'Hyakkiyako', label: '百鬼夜行', color: '#06b6d4' },
  { key: 'Shanhaijing', label: '山海经', color: '#f97316' },
  { key: 'RedWinter', label: '红冬', color: '#ec4899' },
  { key: 'SRT', label: 'SRT', color: '#22c55e' },
  { key: 'Valkyrie', label: '瓦尔基里', color: '#6366f1' },
  { key: 'Arius', label: '阿里乌斯', color: '#78716c' },
  { key: 'Highlander', label: '海兰德', color: '#8b5cf6' },
  { key: 'WildHunt', label: '狂猎', color: '#84cc16' },
  { key: 'ETC', label: '其他', color: '#6b7280' },
]

const BULLET_TYPES: { key: BulletType | ''; label: string }[] = [
  { key: 'Explosion', label: '爆发' },
  { key: 'Pierce', label: '贯穿' },
  { key: 'Mystic', label: '神秘' },
  { key: 'Sonic', label: '振动' },
]

const ARMOR_TYPES: { key: ArmorType | ''; label: string }[] = [
  { key: 'LightArmor', label: '轻装甲' },
  { key: 'HeavyArmor', label: '重装甲' },
  { key: 'Unarmed', label: '特殊装甲' },
  { key: 'ElasticArmor', label: '弹力装甲' },
  { key: 'CompositeArmor', label: '复合装甲' },
]

const WEAPON_TYPES: { key: WeaponType | ''; label: string }[] = [
  { key: 'AR', label: 'AR' }, { key: 'MG', label: 'MG' }, { key: 'SG', label: 'SG' },
  { key: 'SMG', label: 'SMG' }, { key: 'SR', label: 'SR' }, { key: 'HG', label: 'HG' },
  { key: 'RL', label: 'RL' }, { key: 'GL', label: 'GL' }, { key: 'RG', label: 'RG' },
  { key: 'MT', label: 'MT' }, { key: 'FT', label: 'FT' },
]

type FilterSectionType = 'school' | 'bullet' | 'armor' | 'weapon'

interface FilterSection {
  type: FilterSectionType
  label: string
  options: { key: string; label: string; color?: string }[]
}

const FILTER_SECTIONS: FilterSection[] = [
  { type: 'school', label: '学校', options: SCHOOLS.map(({ key, label, color }) => ({ key, label, color })) },
  { type: 'bullet', label: '攻击类型', options: BULLET_TYPES },
  { type: 'armor', label: '装甲类型', options: ARMOR_TYPES },
  { type: 'weapon', label: '武器类型', options: WEAPON_TYPES },
]

// ═══ 子弹类型 → 图标色 ═══
const BULLET_COLORS: Record<BulletType, string> = {
  Explosion: '#f04040',
  Pierce: '#f0c040',
  Mystic: '#50a0f0',
  Sonic: '#c090f0',
}

// ═══ 装甲类型 → 显示色 ═══
const ARMOR_COLORS: Record<ArmorType, string> = {
  LightArmor: '#ef4444',
  HeavyArmor: '#eab308',
  Unarmed: '#4f90ff',
  ElasticArmor: '#c97eff',
  CompositeArmor: '#22c55e',
}

// ═══ 主组件 ═══
export function StudentSearch({ squadType, excludeIds = [], onSelect }: StudentSearchProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ——— 筛选状态 ———
  const [selectedFilters, setSelectedFilters] = useState<
    Record<FilterSectionType, Set<string>>
  >({
    school: new Set(),
    bullet: new Set(),
    armor: new Set(),
    weapon: new Set(),
  })

  // ——— 折叠状态 ———
  const [collapsedMap, setCollapsedMap] = useState<
    Record<FilterSectionType, boolean>
  >({
    school: false,
    bullet: true,
    armor: true,
    weapon: true,
  })

  const toggleCollapse = (type: FilterSectionType) =>
    setCollapsedMap((p) => ({ ...p, [type]: !p[type] }))

  const toggleFilter = (type: FilterSectionType, key: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev[type])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [type]: next }
    })
    resetFocus()
  }

  // 是否有任一筛选生效
  const hasActiveFilters = useMemo(
    () => Object.values(selectedFilters).some((s) => s.size > 0),
    [selectedFilters],
  )

  // ── 数据源 ──
  const students = useStudentStore((s) => s.students)
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  // ── 搜索结果 ──
  const results = useMemo(() => {
    if (!students) return []
    const q = query.toLowerCase().trim()

    return Object.values(students).filter((s) => {
      // SquadType 过滤
      if (squadType && s.SquadType !== squadType) return false

      // 筛选面板
      if (hasActiveFilters) {
        if (selectedFilters.school.size > 0 && !selectedFilters.school.has(s.School)) return false
        if (selectedFilters.bullet.size > 0 && !selectedFilters.bullet.has(s.BulletType)) return false
        if (selectedFilters.armor.size > 0 && !selectedFilters.armor.has(s.ArmorType)) return false
        if (selectedFilters.weapon.size > 0 && !selectedFilters.weapon.has(s.WeaponType)) return false
      }

      // 文字搜索
      if (!q) return true
      return (
        s.Name.toLowerCase().includes(q) ||
        s.School.toLowerCase().includes(q) ||
        s.BulletType.toLowerCase().includes(q)
      )
    })
  }, [students, query, squadType, selectedFilters, hasActiveFilters])

  // 分成"已选"和"可选"两组
  const { assigned, available } = useMemo(() => {
    const a: Student[] = []
    const b: Student[] = []
    for (const s of results) {
      ;(excludeSet.has(s.Id) ? a : b).push(s)
    }
    return { assigned: a, available: b }
  }, [results, excludeSet])

  // 只截断可选列表
  const visible = useMemo(() => available.slice(0, 50), [available])

  // focusIdx 重置 & 边界
  const resetFocus = () => setFocusIdx(0)
  const safeFocusIdx = Math.min(focusIdx, visible.length - 1)

  // ── 键盘导航 ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(i + 1, visible.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && visible[safeFocusIdx]) {
        e.preventDefault()
        onSelect(visible[safeFocusIdx])
      }
    },
    [visible, safeFocusIdx, onSelect],
  )

  const placeholder = squadType
    ? squadType === 'Main'
      ? t.squad.search_placeholder_front
      : t.squad.search_placeholder_back
    : t.squad.search_placeholder

  const totalCount = results.length
  const availableCount = available.length

  return (
    <div className="flex gap-3 h-full min-h-0">
      {/* ━━━━━ 左侧：搜索 + 结果 ━━━━━ */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* 搜索框 */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); resetFocus() }}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full text-sm rounded-lg px-3 py-2 pl-9 border focus:outline-none focus:border-blue-500/50 transition-colors"
            style={{
              background: 'var(--bg-surface-alt)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border)',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); resetFocus() }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* SquadType 标签 + 统计 */}
        <div className="flex items-center justify-between mt-1.5 mb-1 min-h-[18px]">
          {squadType && (
            <span
              className="text-[11px] font-game tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: squadType === 'Main' ? '#ef4444' : '#60a5fa',
                background:
                  squadType === 'Main'
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(96,165,250,0.12)',
              }}
            >
              {squadType === 'Main' ? 'STRIKER' : 'SPECIAL'}
            </span>
          )}
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
            {query || hasActiveFilters
              ? `${tpl(t.search.found, { n: totalCount })}`
              : `${t.search.list_all}`}
          </span>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {/* 已分配学生（灰色不可点击） */}
          {assigned.length > 0 && (
            <>
              <div
                className="text-[11px] px-1 py-0.5 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.squad.added}
              </div>
              {assigned.map((s) => (
                <div
                  key={s.Id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded opacity-50 select-none"
                  style={{ background: 'var(--bg-surface-alt)' }}
                >
                  <StudentAvatar student={s} size={28} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {s.Name}
                    </div>
                  </div>
                  <span className="text-[9px] px-1 rounded" style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
                    ✓
                  </span>
                </div>
              ))}
            </>
          )}

          {/* 可选学生 */}
          {visible.length > 0 && (
            <>
              {assigned.length > 0 && (
                <div className="text-[11px] px-1 py-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                  {tpl(t.search.available, { n: availableCount })}
                </div>
              )}
              {visible.map((student, i) => (
                <button
                  key={student.Id}
                  onClick={() => onSelect(student)}
                  onMouseEnter={() => setFocusIdx(i)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left"
                  style={{
                    background:
                      i === safeFocusIdx
                        ? 'var(--bg-hover)'
                        : 'transparent',
                    outline:
                      i === safeFocusIdx
                        ? '1px solid var(--accent)'
                        : 'none',
                    outlineOffset: -1,
                  }}
                >
                  <StudentAvatar student={student} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {student.Name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {/* 学校logo（暂缺时自动隐藏） */}
                      <img
                        src={`/logos/schools/${student.School}.webp`}
                        alt=""
                        className="w-3.5 h-3.5 rounded shrink-0 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      {/* 学校色块（logo加载成功后作为后备） */}
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background:
                            SCHOOLS.find((sc) => sc.key === student.School)
                              ?.color ?? '#888',
                        }}
                      />
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {SCHOOLS.find((sc) => sc.key === student.School)?.label ??
                          student.School}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="text-[11px] font-game" style={{ color: 'var(--text-muted)' }}>
                        {student.Position}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="text-[11px] font-game" style={{ color: 'var(--text-muted)' }}>
                        {student.WeaponType}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="text-[11px] font-game" style={{ 
                        color: BULLET_COLORS[student.BulletType] ?? 'var(--text-muted)',
                      }}>
                        {BULLET_TYPES.find((bt) => bt.key === student.BulletType)?.label ?? student.BulletType}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="text-[11px] font-game" style={{ 
                        color: ARMOR_COLORS[student.ArmorType] ?? 'var(--text-muted)',
                      }}>
                        {ARMOR_TYPES.find((at) => at.key === student.ArmorType)?.label ?? student.ArmorType}
                      </span>
                    </div>
                  </div>
                  {/* 星级 */}
                  <div className="flex items-center gap-px shrink-0">
                    {Array.from({ length: student.StarGrade }).map((_, j) => (
                      <span key={j} className="text-[9px] leading-none" style={{ color: '#f0c040' }}>
                        ★
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </>
          )}

          {/* 空结果 */}
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <svg
                className="w-8 h-8"
                style={{ color: 'var(--text-muted)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t.squad.no_results}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ━━━━━ 右侧：筛选面板 ━━━━━ */}
      <div
        className="w-48 shrink-0 flex flex-col min-h-0 border-l pl-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* —— 折叠式筛选 —— */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
          {FILTER_SECTIONS.map((section) => {
            const selectedSet = selectedFilters[section.type]
            const isCollapsed = collapsedMap[section.type]
            const count = selectedSet.size

            return (
              <div
                key={section.type}
                className="rounded-md border overflow-hidden"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* 折叠标题 */}
                <button
                  onClick={() => toggleCollapse(section.type)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--bg-surface-alt)' }}
                >
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {section.label}
                    {count > 0 && (
                      <span className="text-[10px] ml-1" style={{ color: 'var(--accent)' }}>
                        ({count})
                      </span>
                    )}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    style={{ color: 'var(--text-muted)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* 筛选选项 */}
                {!isCollapsed && (
                  <div className="px-2 py-1.5 space-y-0.5">
                    {section.options.map((opt) => {
                      const checked = selectedSet.has(opt.key)
                      return (
                        <label
                          key={opt.key}
                          className="flex items-center gap-1.5 cursor-pointer select-none py-0.5 group"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFilter(section.type, opt.key)}
                            className="accent-[color:var(--accent)] w-3 h-3 cursor-pointer"
                          />
                          {/* 学校小色点 */}
                          {section.type === 'school' && opt.key && (
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: (opt as { color?: string }).color ?? '#888' }}
                            />
                          )}
                          <span
                            className={`text-[11px] truncate transition-colors ${section.type === 'weapon' ? 'font-game' : ''}`}
                            style={{
                              color: checked
                                ? 'var(--accent)'
                                : 'var(--text-muted)',
                            }}
                          >
                            {opt.label}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部提示 */}
        {availableCount > visible.length && (
          <div
            className="text-[9px] py-1.5 text-center shrink-0 border-t mt-1"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            {tpl(t.search.showing, { shown: String(visible.length), total: String(availableCount) })}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ 子组件：学生头像 ═══
function StudentAvatar({ student, size }: { student: Student; size: number }) {
  const bulletColor = BULLET_COLORS[student.BulletType] ?? '#888'

  return (
    <div
      className="rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${bulletColor}44, ${bulletColor}22)`,
        color: bulletColor,
        border: `1px solid ${bulletColor}44`,
      }}
    >
      {student.Name.slice(0, 1)}
    </div>
  )
}
