// 学生管理纯逻辑单测：状态文案、影响计数摘要、变更日志一句话摘要。
// 无 DOM 依赖，vitest node 环境直跑。

import { describe, expect, it } from 'vitest'

import {
  countsToText,
  formatChangeSummary,
  formatOpLabel,
  formatStatusLabel,
  isArchived,
  type ChangeLogEntry,
} from '../src/lib/student-management'

function entry(partial: Partial<ChangeLogEntry>): ChangeLogEntry {
  return {
    id: 1,
    op_type: 'update',
    identity_id: null,
    student_id: '20250201',
    before_summary: null,
    after_summary: null,
    detail: null,
    created_at: '2026-08-29T10:00:00',
    ...partial,
  }
}

describe('状态与操作标签', () => {
  it('在班状态：NULL 一律按在班', () => {
    expect(formatStatusLabel(null)).toBe('在班')
    expect(formatStatusLabel(undefined)).toBe('在班')
    expect(formatStatusLabel('active')).toBe('在班')
    expect(formatStatusLabel('transferred')).toBe('转班')
    expect(formatStatusLabel('graduated')).toBe('毕业')
    expect(isArchived('transferred')).toBe(true)
    expect(isArchived('graduated')).toBe(true)
    expect(isArchived(null)).toBe(false)
  })

  it('操作类型有中文标签，未知类型原样回显', () => {
    expect(formatOpLabel('correct_sid')).toBe('纠正学号')
    expect(formatOpLabel('merge')).toBe('合并学生')
    expect(formatOpLabel('mystery')).toBe('mystery')
  })
})

describe('影响计数摘要', () => {
  it('零值字段不展示，全零显示无关联数据', () => {
    expect(
      countsToText({ subject_score: 4, total_score: 2, homework: 1, special: 0, note: 3 })
    ).toBe('单科成绩 4 · 总分记录 2 · 缺交 1 · 档案 3')
    expect(
      countsToText({ subject_score: 0, total_score: 0, homework: 0, special: 0, note: 0 })
    ).toBe('无关联数据')
    expect(countsToText(null)).toBe('—')
  })
})

describe('变更日志一句话摘要', () => {
  it('编辑：逐字段展示前后值', () => {
    const summary = formatChangeSummary(entry({
      op_type: 'update',
      student_id: '20250201',
      before_summary: { name: '张三', seat_no: 1 },
      after_summary: { name: '张三丰', seat_no: 2 },
    }))
    expect(summary).toMatch(/张三 → 张三丰/)
    expect(summary).toMatch(/座号 1 → 2/)
  })

  it('编辑：在班状态变化展示前后状态', () => {
    const summary = formatChangeSummary(entry({
      op_type: 'update',
      student_id: '20250201',
      before_summary: { name: '张三', status: 'active' },
      after_summary: { name: '张三', status: 'transferred' },
    }))
    expect(summary).toMatch(/在班状态 在班 → 转班/)
  })

  it('纠正学号：旧号到新号', () => {
    const summary = formatChangeSummary(entry({
      op_type: 'correct_sid',
      before_summary: { student_id: '20250201', name: '张三' },
      after_summary: { student_id: '20250215', name: '张三' },
    }))
    expect(summary).toMatch(/20250201 → 20250215/)
  })

  it('删除：带影响总数与备份提示', () => {
    const summary = formatChangeSummary(entry({
      op_type: 'delete',
      before_summary: { student_id: '20250215', name: '张三' },
      detail: { counts: { subject_score: 2, total_score: 1, homework: 1, special: 1, note: 1 } },
    }))
    expect(summary).toMatch(/删除 张三/)
    expect(summary).toMatch(/6 条关联数据/)
    expect(summary).toMatch(/自动备份/)
  })

  it('合并：重复学号并入主学号并展示迁入条数', () => {
    const summary = formatChangeSummary(entry({
      op_type: 'merge',
      before_summary: { duplicate_student_id: '20250231', duplicate_name: '张小三' },
      after_summary: { primary_student_id: '20250230', primary_name: '王小主' },
      detail: { moved: { subject_score: 1, homework: 1 } },
    }))
    expect(summary).toMatch(/张小三.*20250231/)
    expect(summary).toMatch(/王小主.*20250230/)
    expect(summary).toMatch(/迁入 2 条/)
  })

  it('回填与归档', () => {
    expect(
      formatChangeSummary(entry({ op_type: 'backfill', detail: { created: 5 } }))
    ).toMatch(/5 名学生/)
    expect(
      formatChangeSummary(entry({ op_type: 'archive', after_summary: { status: 'graduated' } }))
    ).toMatch(/毕业离校/)
    expect(
      formatChangeSummary(entry({ op_type: 'restore', student_id: '20250240' }))
    ).toMatch(/恢复在班/)
  })
})
