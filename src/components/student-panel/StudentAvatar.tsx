import { useState } from 'react'
import type { Student } from '../../types/student'

interface StudentAvatarProps {
  student: Student
  size?: number
}

export function StudentAvatar({ student, size = 44 }: StudentAvatarProps) {
  const [imgError, setImgError] = useState(false)

  const showImg = student.Icon && !imgError

  return (
    <div
      className="rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center ring-2 ring-gray-600/50 shrink-0"
      style={{ width: size, height: size, minWidth: size }}
    >
      {showImg ? (
        <img
          src={`${import.meta.env.BASE_URL}icons/${student.Icon}.webp`}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-sm font-bold text-gray-400 select-none">
          {student.Name.charAt(0)}
        </span>
      )}
    </div>
  )
}
