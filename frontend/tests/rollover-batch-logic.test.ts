// 同名批量确认纯逻辑契约：安全项判定（姓名规范化、唯一候选、候选未占用、
// 教师绑定班级、批内候选不重复）、默认选择与提交载荷构造。

import { describe, expect, it } from 'vitest'

import {
  buildDefaultDecisions,
  buildSubmitItems,
  computeSafeRows,
  isDecisionReady,
  isRowSafe,
  normalizeName,
  type AmbiguousStudent,
} from '../src/lib/rollover-batch'

function cand(overrides: Partial<AmbiguousStudent['candidates'][number]> = {}) {
  return {
    student_id: 'g1_101',
    name: '陈一',
    class_num: 6,
    latest_exam_name: '高一期末',
    latest_main_score: 240,
    latest_main_rank: 10,
    already_linked: false,
    ...overrides,
  }
}

function row(overrides: Partial<AmbiguousStudent> = {}): AmbiguousStudent {
  return {
    student_id: 'g2_201',
    name: '陈一',
    candidates: [cand()],
    ...overrides,
  }
}

describe('normalizeName', () => {
  it('去掉全部空白，含全角空格（与后端 _norm_name 同口径）', () => {
    expect(normalizeName('陈 一')).toBe('陈一')
    expect(normalizeName('陈　一')).toBe('陈一')
    expect(normalizeName(' 陈一 ')).toBe('陈一')
    expect(normalizeName(null)).toBe('')
  })
})

describe('isRowSafe', () => {
  it('唯一候选 + 姓名一致 + 候选未占用 + 班级匹配 -> 安全', () => {
    expect(isRowSafe(row(), true)).toBe(true)
  })

  it('多候选 / 候选已被关联 / 姓名不一致 / 班级未绑定 -> 不安全', () => {
    expect(isRowSafe(row({ candidates: [cand(), cand({ student_id: 'g1_102' })] }), true)).toBe(false)
    expect(isRowSafe(row({ candidates: [cand({ already_linked: true })] }), true)).toBe(false)
    expect(isRowSafe(row({ candidates: [cand({ name: '陈二' })] }), true)).toBe(false)
    expect(isRowSafe(row(), false)).toBe(false)
    expect(isRowSafe(row({ name: null }), true)).toBe(false)
  })

  it('姓名带空格但规范化后一致 -> 仍安全', () => {
    expect(isRowSafe(row({ candidates: [cand({ name: '陈 一' })] }), true)).toBe(true)
  })
})

describe('computeSafeRows / buildDefaultDecisions', () => {
  it('默认选择：安全项 -> 同一人，异常项 -> 稍后处理', () => {
    const rows = [
      row(), // 安全
      row({ student_id: 'g2_202', name: '王五', candidates: [cand({ student_id: 'g1_103', name: '王五' }), cand({ student_id: 'g1_104', name: '王五' })] }),
      row({ student_id: 'g2_204', name: '赵六', candidates: [cand({ student_id: 'g1_105', name: '赵六', already_linked: true })] }),
    ]
    const decisions = buildDefaultDecisions(rows, true)
    expect(decisions['g2_201']).toEqual({ choice: 'link', g1_student_id: 'g1_101' })
    expect(decisions['g2_202']).toEqual({ choice: 'later' })
    expect(decisions['g2_204']).toEqual({ choice: 'later' })
    expect(computeSafeRows(rows, true)).toEqual(new Set(['g2_201']))
  })

  it('两个高二同名行共指唯一高一候选 -> 双双不安全（批内不重复）', () => {
    const rows = [
      row({ student_id: 'g2_207', name: '吴九', candidates: [cand({ student_id: 'g1_107', name: '吴九' })] }),
      row({ student_id: 'g2_208', name: '吴九', candidates: [cand({ student_id: 'g1_107', name: '吴九' })] }),
    ]
    expect(computeSafeRows(rows, true)).toEqual(new Set())
    const decisions = buildDefaultDecisions(rows, true)
    expect(decisions['g2_207']).toEqual({ choice: 'later' })
    expect(decisions['g2_208']).toEqual({ choice: 'later' })
  })

  it('唯一候选学号与批内任意高二学号相同 -> 该行不安全（服务端会拒 g1 撞批内 g2）', () => {
    // 第一行的候选 g1_101 恰是第二行的高二学号
    const rows = [
      row(),
      row({ student_id: 'g1_101', name: '钱九', candidates: [cand({ student_id: 'g1_900', name: '钱九' })] }),
    ]
    expect(computeSafeRows(rows, true)).toEqual(new Set(['g1_101']))
    const decisions = buildDefaultDecisions(rows, true)
    expect(decisions['g2_201']).toEqual({ choice: 'later' })
    expect(decisions['g1_101']).toEqual({ choice: 'link', g1_student_id: 'g1_900' })
  })

  it('候选学号与本行自己的高二学号相同（自撞）-> 不安全', () => {
    const rows = [row({ student_id: 'g1_101', candidates: [cand()] })]
    expect(computeSafeRows(rows, true)).toEqual(new Set())
  })
})

describe('isDecisionReady / buildSubmitItems', () => {
  it('link 必须已选具体候选；new 直接可提交；later 与缺失不提交', () => {
    expect(isDecisionReady({ choice: 'link', g1_student_id: 'g1_101' })).toBe(true)
    expect(isDecisionReady({ choice: 'link' })).toBe(false)
    expect(isDecisionReady({ choice: 'new' })).toBe(true)
    expect(isDecisionReady({ choice: 'later' })).toBe(false)
    expect(isDecisionReady(undefined)).toBe(false)
  })

  it('提交载荷只含已明确的行，且带学号与姓名', () => {
    const rows = [
      row(),
      row({ student_id: 'g2_202', name: '王五', candidates: [cand({ student_id: 'g1_103', name: '王五' }), cand({ student_id: 'g1_104', name: '王五' })] }),
      row({ student_id: 'g2_203', name: '刘三', candidates: [cand({ student_id: 'g1_106', name: '刘三' })] }),
    ]
    const decisions = {
      g2_201: { choice: 'link', g1_student_id: 'g1_101' },
      g2_202: { choice: 'link' }, // 多候选还没选具体人 -> 不提交
      g2_203: { choice: 'new' },
    } as const
    expect(buildSubmitItems(rows, decisions as never)).toEqual([
      { g2_student_id: 'g2_201', name: '陈一', decision: 'link', g1_student_id: 'g1_101' },
      { g2_student_id: 'g2_203', name: '刘三', decision: 'new', g1_student_id: null },
    ])
  })
})
