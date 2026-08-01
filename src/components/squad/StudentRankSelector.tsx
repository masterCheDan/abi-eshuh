import { useSquadStore } from '../../stores/useSquadStore'
import { MAX_STAR_LEVEL, MAX_UNIQUE_WEAPON_LEVEL } from '../../utils/studentRank'

interface StudentRankSelectorProps {
  slotIndex: number
}

const STAR_LEVELS = Array.from({ length: MAX_STAR_LEVEL }, (_, index) => index + 1)
const WEAPON_LEVELS = Array.from({ length: MAX_UNIQUE_WEAPON_LEVEL }, (_, index) => index + 1)

function RankStar({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block h-[18px] w-[18px]"
      fill="currentColor"
    >
      <path d="M12 1.9 15.09 8.16l6.91 1-5 4.87 1.18 6.88L12 17.66l-6.18 3.25L7 14.03l-5-4.87 6.91-1L12 1.9Z" />
      {!active && (
        <path
          d="M12 5.52 14 9.57l4.47.65-3.24 3.15.77 4.45L12 15.72l-4 2.1.77-4.45-3.24-3.15L10 9.57l2-4.05Z"
          fill="rgba(15, 23, 42, 0.48)"
        />
      )}
    </svg>
  )
}

export function StudentRankSelector({ slotIndex }: StudentRankSelectorProps) {
  const slot = useSquadStore((state) => state.config.slots.find(item => item.index === slotIndex))
  const setStarLevel = useSquadStore((state) => state.setStarLevel)
  const setUniqueWeaponLevel = useSquadStore((state) => state.setUniqueWeaponLevel)

  if (!slot?.student) return null

  return (
    <div
      className="flex h-8 w-fit shrink-0 items-center rounded-full px-2"
      style={{
        background: 'rgba(17, 18, 22, 0.72)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035), 0 1px 2px rgba(0,0,0,0.18)',
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-px" role="group" aria-label="学生星级">
        {STAR_LEVELS.map((level) => {
          const active = level <= slot.starLevel
          const belowBase = level < slot.student!.StarGrade
          return (
            <button
              key={level}
              type="button"
              disabled={belowBase}
              aria-label={`${level}星`}
              aria-pressed={slot.starLevel === level}
              title={belowBase ? `初始星级最低为 ${slot.student!.StarGrade}★` : `设为 ${level}★`}
              className="flex h-5 w-5 items-center justify-center transition-transform enabled:hover:scale-110 disabled:cursor-not-allowed"
              style={{
                color: active ? '#ffc928' : '#55491f',
                filter: active ? 'drop-shadow(0 0 2px rgba(255, 201, 40, 0.28))' : 'none',
              }}
              onClick={() => setStarLevel(slot.index, level)}
            >
              <RankStar active={active} />
            </button>
          )
        })}
      </div>

      <div className="ml-1.5 flex items-center gap-px" role="group" aria-label="专武等级">
        {WEAPON_LEVELS.map((level) => {
          const active = level <= slot.uniqueWeaponLevel
          return (
            <button
              key={level}
              type="button"
              aria-label={`专武${level}星`}
              aria-pressed={slot.uniqueWeaponLevel === level}
              title={`专武${level}${slot.uniqueWeaponLevel === level ? '；再次点击取消专武' : '；选择后自动升至 5★'}${level === 2 ? '，解锁强化被动' : ''}${level === 4 && slot.slotType === 'Support' ? '，Cost 上限 +0.5' : ''}`}
              className="flex h-5 w-5 items-center justify-center transition-transform hover:scale-110"
              style={{
                color: active ? '#35c9ed' : '#234552',
                filter: active ? 'drop-shadow(0 0 2px rgba(53, 201, 237, 0.32))' : 'none',
              }}
              onClick={() => setUniqueWeaponLevel(
                slot.index,
                slot.uniqueWeaponLevel === level ? 0 : level,
              )}
            >
              <RankStar active={active} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
