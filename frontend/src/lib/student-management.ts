// 学生管理页的纯逻辑与类型：字段标签、状态文案、影响计数摘要、变更日志摘要。
// 只放可独立单测的纯函数；接口调用与状态流转在页面组件里。

export interface ManageStudentCounts {
  subject_score: number
  total_score: number
  homework: number
  special: number
  note: number
}

export interface ManageAlias {
  student_id: string
  grade: number | null
  class_num: number | null
}

export interface ManageStudent {
  student_id: string
  name: string
  name_source?: 'identity' | 'roster' | 'score' | 'sid'
  gender?: string | null
  seat_no?: number | null
  note?: string | null
  excluded?: number
  status?: string | null
  in_roster: boolean
  identity_id: number | null
  aliases: ManageAlias[]
  counts: ManageStudentCounts
  latest_exam_name?: string | null
  latest_main_score?: number | null
  latest_main_rank?: number | null
}

export interface MergeConflictItem {
  exam_id: number
  exam_name: string
}

export interface MergePreview {
  primary?: { student_id: string; name: string; counts: ManageStudentCounts }
  duplicate?: { student_id: string; name: string; counts: ManageStudentCounts }
  conflicts: MergeConflictItem[]
  mergeable: boolean
  message?: string
}

export interface DeletePreview {
  student_id: string
  counts: ManageStudentCounts
  total_refs: number
  requires_confirm: boolean
  /** 删除后仍保留的其他历史学号（主档继续沿用） */
  other_aliases_kept?: string[]
  /** 删除后仍保留的手工导入历史成绩条数 */
  imported_history_kept?: number
}

export interface ChangeLogEntry {
  id: number
  op_type: string
  identity_id: number | null
  student_id: string | null
  before_summary: Record<string, unknown> | null
  after_summary: Record<string, unknown> | null
  detail: Record<string, unknown> | null
  created_at: string | null
}

/** 在班状态文案；NULL 一律按在班 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (status === 'transferred') return '转班'
  if (status === 'graduated') return '毕业'
  return '在班'
}

export function isArchived(status: string | null | undefined): boolean {
  return status === 'transferred' || status === 'graduated'
}

const OP_LABELS: Record<string, string> = {
  create: '新增学生',
  update: '编辑信息',
  correct_sid: '纠正学号',
  new_year_sid: '新学年学号',
  archive: '归档离班',
  restore: '恢复在班',
  delete: '删除学生',
  merge: '合并学生',
  backfill: '建立主档',
}

export function formatOpLabel(opType: string | null | undefined): string {
  return (opType && OP_LABELS[opType]) || opType || '未知操作'
}

/** 影响计数 → 紧凑摘要（0 项不展示），如「成绩 2 · 缺交 1 · 档案 1」 */
export function countsToText(counts: ManageStudentCounts | null | undefined): string {
  if (!counts) return '—'
  const parts: string[] = []
  if (counts.subject_score) parts.push(`单科成绩 ${counts.subject_score}`)
  if (counts.total_score) parts.push(`总分记录 ${counts.total_score}`)
  if (counts.homework) parts.push(`缺交 ${counts.homework}`)
  if (counts.special) parts.push(`特殊记录 ${counts.special}`)
  if (counts.note) parts.push(`档案 ${counts.note}`)
  return parts.length ? parts.join(' · ') : '无关联数据'
}

function pickText(summary: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!summary) return null
  for (const key of keys) {
    const value = summary[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return null
}

/** 变更日志条目 → 一句人话摘要（只取业务字段，日志本身不含任何凭据） */
export function formatChangeSummary(entry: ChangeLogEntry): string {
  const before = entry.before_summary ?? {}
  const after = entry.after_summary ?? {}
  const name = pickText(after, ['name', 'primary_name']) ?? pickText(before, ['name']) ?? ''
  const sid = (after.student_id as string) || (after.added_student_id as string) || entry.student_id || ''
  switch (entry.op_type) {
    case 'create':
      return `新建 ${name || sid || ''}（${sid}）`
    case 'update': {
      const changes: string[] = []
      if (before.name !== after.name && after.name) changes.push(`姓名 ${before.name ?? '—'} → ${after.name}`)
      if (before.gender !== after.gender) changes.push(`性别 ${before.gender ?? '—'} → ${after.gender ?? '—'}`)
      if (before.seat_no !== after.seat_no) changes.push(`座号 ${before.seat_no ?? '—'} → ${after.seat_no ?? '—'}`)
      if (before.note !== after.note) changes.push('备注更新')
      if (before.status !== after.status) {
        changes.push(
          `在班状态 ${formatStatusLabel(before.status as string)} → ${formatStatusLabel(after.status as string)}`
        )
      }
      return changes.length ? `${name || sid}：${changes.join('，')}` : `${name || sid}：信息更新`
    }
    case 'correct_sid':
      return `${name || ''}：学号 ${before.student_id ?? '—'} → ${after.student_id ?? '—'}`
    case 'new_year_sid':
      return `${name || sid}：新增学号 ${after.added_student_id ?? '—'}`
    case 'archive':
      return `${name || sid}：${after.status === 'graduated' ? '毕业离校' : '转班离班'}`
    case 'restore':
      return `${name || sid}：恢复在班`
    case 'delete': {
      const detail = entry.detail ?? {}
      const counts = detail.counts as ManageStudentCounts | undefined
      const total = counts ? Object.values(counts).reduce((a, b) => a + (b || 0), 0) : 0
      return total > 0 ? `删除 ${name || sid}（含 ${total} 条关联数据，已自动备份）` : `删除 ${name || sid}`
    }
    case 'merge': {
      const detail = entry.detail ?? {}
      const moved = detail.moved as Record<string, number> | undefined
      const total = moved ? Object.values(moved).reduce((a, b) => a + (b || 0), 0) : 0
      return `合并 ${before.duplicate_name ?? ''}（${before.duplicate_student_id ?? '—'}）→ ${after.primary_name ?? ''}（${after.primary_student_id ?? '—'}），迁入 ${total} 条数据`
    }
    case 'backfill': {
      const detail = entry.detail ?? {}
      const created = typeof detail.created === 'number' ? detail.created : null
      return `为本班 ${created ?? '?'} 名学生建立跨学年主档`
    }
    default:
      return `${name || sid}：${formatOpLabel(entry.op_type)}`
  }
}
