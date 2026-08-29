// 同名批量确认的纯逻辑：姓名规范化、严格安全项判定、默认选择、提交载荷构造。
// 与后端 rollover/service.confirm_batch 的安全口径一一对应（姓名规范化一致、
// 唯一候选、候选未被关联、教师绑定目标班、批内学号不重复）；服务端仍会
// 重新核验，前端 safe 判定只用于默认勾选与提示，不是信任边界。

export interface AmbiguousCandidate {
  student_id: string
  name: string
  class_num: number | null
  latest_exam_name: string | null
  latest_main_score: number | null
  latest_main_rank: number | null
  already_linked: boolean
}

export interface AmbiguousStudent {
  student_id: string
  name: string | null
  candidates: AmbiguousCandidate[]
}

export type ConfirmChoice = 'link' | 'new' | 'later'

export interface ConfirmDecision {
  choice: ConfirmChoice
  /** choice === 'link' 时必须已选定具体的高一候选学号，否则视为未完成 */
  g1_student_id?: string
}

export interface ConfirmBatchItemPayload {
  g2_student_id: string
  name: string | null
  decision: 'link' | 'new'
  g1_student_id?: string | null
}

/** 姓名规范化：去掉全部空白（含全角空格），与后端 _norm_name 同口径 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, '')
}

/** 行级严格安全（不含批内重复判定，那需要全表视角） */
export function isRowSafe(row: AmbiguousStudent, classBound: boolean): boolean {
  if (!classBound) return false
  if (!row.name) return false
  if (row.candidates.length !== 1) return false
  const candidate = row.candidates[0]
  return !candidate.already_linked && normalizeName(candidate.name) === normalizeName(row.name)
}

/**
 * 全表严格安全集：在行级安全之上，再排除两类「默认选同一人必被服务端整批
 * 拒绝」的行——
 *   1) 唯一候选与批内任意高二学号相同（服务端禁止 g1 撞批内 g2）；
 *   2) 唯一候选被多行共享（批内重复使用同一高一学号）。
 */
export function computeSafeRows(
  rows: AmbiguousStudent[],
  classBound: boolean,
): Set<string> {
  const rowSafe = new Map(rows.map((r) => [r.student_id, isRowSafe(r, classBound)]))
  const batchG2 = new Set(rows.map((r) => r.student_id))
  const usersByCandidate = new Map<string, string[]>()
  for (const row of rows) {
    if (!rowSafe.get(row.student_id)) continue
    const sid = row.candidates[0].student_id
    usersByCandidate.set(sid, [...(usersByCandidate.get(sid) ?? []), row.student_id])
  }
  const safe = new Set<string>()
  for (const row of rows) {
    if (!rowSafe.get(row.student_id)) continue
    const candidate = row.candidates[0].student_id
    if (batchG2.has(candidate)) continue
    const users = usersByCandidate.get(candidate) ?? []
    if (users.length === 1) safe.add(row.student_id)
  }
  return safe
}

/** 默认选择：严格安全项 -> 同一人（唯一候选），其余 -> 稍后处理 */
export function buildDefaultDecisions(
  rows: AmbiguousStudent[],
  classBound: boolean,
): Record<string, ConfirmDecision> {
  const safe = computeSafeRows(rows, classBound)
  return Object.fromEntries(
    rows.map((row) => [
      row.student_id,
      safe.has(row.student_id)
        ? { choice: 'link', g1_student_id: row.candidates[0].student_id }
        : { choice: 'later' },
    ]),
  )
}

/** 该行决策是否已明确到可提交（link 必须已选具体候选） */
export function isDecisionReady(decision: ConfirmDecision | undefined): boolean {
  if (!decision) return false
  if (decision.choice === 'new') return true
  return decision.choice === 'link' && !!decision.g1_student_id
}

/** 组装提交载荷：link（含候选）/ new 入列；later 与未选候选的行留在页面 */
export function buildSubmitItems(
  rows: AmbiguousStudent[],
  decisions: Record<string, ConfirmDecision>,
): ConfirmBatchItemPayload[] {
  const items: ConfirmBatchItemPayload[] = []
  for (const row of rows) {
    const decision = decisions[row.student_id]
    if (!isDecisionReady(decision)) continue
    if (decision!.choice === 'link') {
      items.push({
        g2_student_id: row.student_id,
        name: row.name,
        decision: 'link',
        g1_student_id: decision!.g1_student_id!,
      })
    } else {
      items.push({
        g2_student_id: row.student_id,
        name: row.name,
        decision: 'new',
        g1_student_id: null,
      })
    }
  }
  return items
}
