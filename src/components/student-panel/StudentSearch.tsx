import { useState, useMemo } from 'react'
import { useStudentStore } from '../../stores/useStudentStore'
import type { Student, SquadType, School, BulletType, ArmorType, WeaponType } from '../../types/student'
import { useI18n, tpl } from '../../i18n'

export interface StudentSearchProps {
  squadType?: SquadType
  excludeIds?: number[]
  onSelect: (student: Student) => void
}

// ─── 筛选选项数据 ───────────────────────────────

const SCHOOLS: { key: School | ''; label: string }[] = [
  { key: 'Abydos', label: '阿比多斯' },
  { key: 'Arius', label: '阿里乌斯' },
  { key: 'Gehenna', label: '格黑娜' },
  { key: 'Hyakkiyako', label: '百鬼夜行' },
  { key: 'Millennium', label: '千禧年' },
  { key: 'RedWinter', label: '红冬' },
  { key: 'SRT', label: 'SRT' },
  { key: 'Shanhaijing', label: '山海经' },
  { key: 'Trinity', label: '三一' },
  { key: 'Valkyrie', label: '瓦尔基里' },
  { key: 'Sakugawa', label: '坂口' },
  { key: 'Tokiwadai', label: '常盘台' },
  { key: 'WildHunt', label: 'WildHunt' },
  { key: 'Highlander', label: '海兰德' },
  { key: 'ETC', label: '其他' },
]

const BULLET_TYPES: { key: BulletType | ''; label: string }[] = [
  { key: 'Explosion', label: '爆发' },
  { key: 'Pierce', label: '贯穿' },
  { key: 'Mystic', label: '神秘' },
  { key: 'Sonic', label: '音波' },
]

const ARMOR_TYPES: { key: ArmorType | ''; label: string }[] = [
  { key: 'LightArmor', label: '轻装甲' },
  { key: 'HeavyArmor', label: '重装甲' },
  { key: 'CompositeArmor', label: '复合装甲' },
  { key: 'ElasticArmor', label: '弹性装甲' },
  { key: 'Unarmed', label: '无装甲' },
]

const WEAPON_TYPES: { key: WeaponType | ''; label: string }[] = [
  { key: 'AR', label: 'AR' }, { key: 'MG', label: 'MG' }, { key: 'SG', label: 'SG' },
  { key: 'SMG', label: 'SMG' }, { key: 'SR', label: 'SR' }, { key: 'HG', label: 'HG' },
  { key: 'RL', label: 'RL' }, { key: 'GL', label: 'GL' }, { key: 'RG', label: 'RG' },
  { key: 'MT', label: 'MT' }, { key: 'FT', label: 'FT' },
]

// ─── 筛选区块配置 ───────────────────────────────

interface FilterSection {
  label: string
  type: 'school' | 'bullet' | 'armor' | 'weapon'
  options: { key: string; label: string }[]
}

const FILTER_SECTIONS: FilterSection[] = [
  { label: '学校', type: 'school', options: SCHOOLS },
  { label: '攻击类型', type: 'bullet', options: BULLET_TYPES },
  { label: '装甲类型', type: 'armor', options: ARMOR_TYPES },
  { label: '武器类型', type: 'weapon', options: WEAPON_TYPES },
]

// ─── 主组件 ─────────────────────────────────────

export function StudentSearch({ squadType, excludeIds = [], onSelect }: StudentSearchProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [enableFilter, setEnableFilter] = useState(false)

  // 筛选状态：每个分类各自是一个 Set<string>
  const [selectedSchool, setSelectedSchool] = useState<Set<string>>(new Set())
  const [selectedBullet, setSelectedBullet] = useState<Set<string>>(new Set())
  const [selectedArmor, setSelectedArmor] = useState<Set<string>>(new Set())
  const [selectedWeapon, setSelectedWeapon] = useState<Set<string>>(new Set())

  // 折叠状态：每个分类默认折叠
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({
    school: true,
    bullet: true,
    armor: true,
    weapon: true,
  })

  const toggleCollapse = (type: string) => {
    setCollapsedMap((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const students = useStudentStore((s) => s.students)
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const results = useMemo(() => {
    if (!students) return []

    const q = query.toLowerCase().trim()
    const all = Object.values(students)

    return all.filter((s) => {
      if (squadType && s.SquadType !== squadType) return false
      if (excludeSet.has(s.Id)) return false

      // 筛选——只展示勾选的内容，没勾选则展示全部
      if (enableFilter) {
        if (selectedSchool.size > 0 && !selectedSchool.has(s.School)) return false
        if (selectedBullet.size > 0 && !selectedBullet.has(s.BulletType)) return false
        if (selectedArmor.size > 0 && !selectedArmor.has(s.ArmorType)) return false
        if (selectedWeapon.size > 0 && !selectedWeapon.has(s.WeaponType)) return false
      }

      if (!q) return true
      return (
        s.Name.toLowerCase().includes(q) ||
        s.School.toLowerCase().includes(q) ||
        s.Position.toLowerCase().includes(q) ||
        s.BulletType.toLowerCase().includes(q) ||
        s.ArmorType.toLowerCase().includes(q)
      )
    }).slice(0, 30)
  }, [students, query, squadType, excludeSet, enableFilter, selectedSchool, selectedBullet, selectedArmor, selectedWeapon])

  const placeholder = squadType
    ? (squadType === 'Main' ? t.squad.search_placeholder_front : t.squad.search_placeholder_back)
    : t.squad.search_placeholder

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex gap-3 h-full min-h-0">
      {/* ── 左半边：搜索 + 结果列表 ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* 搜索栏 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full bg-gray-700 text-sm text-white rounded-lg px-3 py-2 pl-9 border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-400"
            />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={() => { /* 搜索按钮 - 已支持即时搜索，这里留作备用 */ }}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors shrink-0"
          >
            搜索
          </button>
        </div>

        {/* 结果计数 */}
        {query && (
          <p className="text-[11px] text-gray-500 mt-1.5">
            {tpl(t.search.found, { n: results.length })}
          </p>
        )}

        {/* 结果列表（可滚动） */}
        <div className="flex-1 overflow-y-auto mt-2 space-y-0.5 min-h-0">
          {results.map((student) => (
            <button
              key={student.Id}
              onClick={() => onSelect(student)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-[10px] shrink-0">
                {student.Name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate font-medium">{student.Name}</div>
                <div className="text-[10px] text-gray-500 truncate">
                  {student.School} · {student.Position} · {student.BulletType} · {student.ArmorType}
                </div>
              </div>
              <div className="text-[10px] text-yellow-400 shrink-0">
                {'★'.repeat(student.StarGrade)}
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-6">{t.squad.no_results}</p>
          )}
        </div>
      </div>

      {/* ── 右半边：筛选面板 ── */}
      <div className="w-48 shrink-0 flex flex-col min-h-0 border-l border-gray-700 pl-3">
        {/* 启用筛选开关 */}
        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enableFilter}
            onChange={(e) => setEnableFilter(e.target.checked)}
            className="accent-blue-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-300">启用筛选</span>
        </label>

        {/* 筛选区块（可折叠） */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {FILTER_SECTIONS.map((section) => {
            const selectedSet = getSelectedSet(section.type, selectedSchool, selectedBullet, selectedArmor, selectedWeapon)
            const setter = getSetter(section.type, setSelectedSchool, setSelectedBullet, setSelectedArmor, setSelectedWeapon)
            const isCollapsed = collapsedMap[section.type]
            const count = selectedSet.size

            return (
              <div key={section.type} className="border border-gray-700 rounded overflow-hidden">
                {/* 折叠头 */}
                <button
                  onClick={() => toggleCollapse(section.type)}
                  className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-750 hover:bg-gray-700 text-left"
                >
                  <span className="text-[11px] text-gray-300 font-medium">
                    {section.label}
                    {count > 0 && <span className="text-blue-400 ml-1">({count})</span>}
                  </span>
                  <svg
                    className={`w-3 h-3 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* 折叠内容 */}
                {!isCollapsed && (
                  <div className="px-2 py-1.5 space-y-1">
                    {section.options.map((opt) => (
                      <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(opt.key)}
                          onChange={() => handleToggle(setter, opt.key)}
                          className="accent-blue-500 w-3 h-3"
                        />
                        <span className={`text-[11px] ${selectedSet.has(opt.key) ? 'text-blue-300' : 'text-gray-400 group-hover:text-gray-200'}`}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── 辅助函数 ───────────────────────────────────

function getSelectedSet(
  type: string,
  schools: Set<string>,
  bullets: Set<string>,
  armors: Set<string>,
  weapons: Set<string>,
): Set<string> {
  switch (type) {
    case 'school': return schools
    case 'bullet': return bullets
    case 'armor': return armors
    case 'weapon': return weapons
    default: return new Set()
  }
}

function getSetter(
  type: string,
  setSchool: React.Dispatch<React.SetStateAction<Set<string>>>,
  setBullet: React.Dispatch<React.SetStateAction<Set<string>>>,
  setArmor: React.Dispatch<React.SetStateAction<Set<string>>>,
  setWeapon: React.Dispatch<React.SetStateAction<Set<string>>>,
): React.Dispatch<React.SetStateAction<Set<string>>> {
  switch (type) {
    case 'school': return setSchool
    case 'bullet': return setBullet
    case 'armor': return setArmor
    case 'weapon': return setWeapon
    default: throw new Error('unknown filter type')
  }
}
