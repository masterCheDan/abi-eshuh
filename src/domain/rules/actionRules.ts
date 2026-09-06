import type { Student } from '../../types/student'
import { catalog } from './catalog'
import { inspectActionData } from './actionData.mjs'

/** 仅数据预检；不能当作已开启调度或已认证队伍级自动资格。 */
export function inspectStudentActionData(student: Student) {
  return inspectActionData(student, catalog)
}
