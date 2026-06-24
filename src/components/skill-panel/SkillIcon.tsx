import { type BulletType } from '../../types/student'

/**
 * SchaleDB 技能图标：圆角六边形底色 + 白色 webp 图标
 * 未来图标实际文件来源：public/skills/ 目录
 */

/** 子弹类型 → 六边形底色 */
const BULLET_COLORS: Record<BulletType, string> = {
  Explosion: '#bd3a2a',
  Mystic: '#228fdb',
  Pierce: '#ca9922',
  Sonic: '#8b39b7',
}

/** 从技能 Icon 字段推导文件名（SchaleDB 格式） */
export function skillIconSrc(iconField: string): string {
  if (!iconField) return ''
  return `/skills/${iconField}.webp`
}

interface SkillIconProps {
  /** 技能 Icon 字段（如 COMMON_SKILLICON_CIRCLE） */
  icon: string
  /** 学生的子弹类型 */
  bulletType: BulletType
  /** 图标尺寸 */
  size?: number
  /** 圆角六边形背景不透明度 */
  bgAlpha?: number
}

export function SkillIcon({ icon, bulletType, size = 32, bgAlpha = 1 }: SkillIconProps) {
  const color = BULLET_COLORS[bulletType] || BULLET_COLORS.Explosion
  const vb = 37.6
  const half = vb / 2

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 圆角六边形底色 */}
      <svg
        viewBox={`0 0 ${vb} ${vb}`}
        width={size}
        height={size}
        className="absolute inset-0"
        style={{ opacity: bgAlpha }}
      >
        <path
          d={`m${half} 0c-0.96 0-1.92 0.161-2.47 0.481l-13.1 7.98c-1.13 0.653-1.81 1.8-1.81 3.03v14.6c0 1.23 0.684 2.37 1.81 3.03l13.1 7.98c1.11 0.642 3.85 0.665 4.95 0l13.1-7.98c1.11-0.677 1.81-1.8 1.81-3.03v-14.6c0-1.23-0.699-2.35-1.81-3.03l-13.1-7.98c-0.554-0.321-1.51-0.481-2.47-0.481z`}
          fill={color}
        />
      </svg>

      {/* 白色技能图标 */}
      {icon && (
        <img
          src={skillIconSrc(icon)}
          alt=""
          className="absolute inset-0 w-full h-full object-contain p-[15%]"
          style={{ filter: 'brightness(0) invert(1)' }}
          loading="lazy"
        />
      )}
    </div>
  )
}
