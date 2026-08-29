// @vitest-environment jsdom

// 学生管理页 roster-only 呈现契约：仅有花名册、尚无成绩的学生也出现在
// 当前班名单里，成绩/名次/最近考试显示「—」，且可按姓名搜索。

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HomeroomScopeProvider } from '../src/components/providers/HomeroomScopeProvider'
import StudentManagePage from '../src/app/student/page'

const teacher = {
  id: 1,
  name: '测试老师',
  target_class_high1: 6,
  target_class_high2: 6,
  target_class_high3: null,
  active_grade: 2,
}

const students = [
  {
    student_id: '20250201',
    name: '张三',
    name_source: 'roster',
    gender: '男',
    seat_no: 1,
    note: null,
    excluded: 0,
    status: null,
    in_roster: true,
    identity_id: null,
    aliases: [],
    counts: { subject_score: 4, total_score: 2, homework: 1, special: 0, note: 0 },
    latest_exam_name: '高二开学测',
    latest_main_score: 261,
    latest_main_rank: 12,
  },
  {
    student_id: 'TMP-2-6-赵六',
    name: '赵六',
    name_source: 'roster',
    gender: null,
    seat_no: null,
    note: null,
    excluded: 0,
    status: null,
    in_roster: true,
    identity_id: null,
    aliases: [],
    counts: { subject_score: 0, total_score: 0, homework: 0, special: 0, note: 0 },
    latest_exam_name: null,
    latest_main_score: null,
    latest_main_rank: null,
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StudentManagePage roster-only students', () => {
  it('显示仅有花名册的学生，空成绩字段用「—」且不显示为 0', async () => {
    const fetchMock = vi.fn<typeof fetch>((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/teacher')) return Promise.resolve(jsonResponse(teacher))
      if (url.startsWith('/api/manage/students')) return Promise.resolve(jsonResponse(students))
      if (url.startsWith('/api/manage/change-log')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider>
        <StudentManagePage />
      </HomeroomScopeProvider>
    )

    // roster-only 学生进入名单（桌面表格 + 移动卡片同时渲染，取桌面行断言）
    const zhaoCells = await screen.findAllByText('赵六')
    expect(zhaoCells.length).toBeGreaterThan(0)
    expect(screen.getAllByText('TMP-2-6-赵六').length).toBeGreaterThan(0)

    // 该行的主三门总分 / 年级名次 / 最近考试均为「—」，绝不显示 0
    const row = zhaoCells.map((el) => el.closest('tr')).find((tr) => tr != null)
    expect(row).toBeTruthy()
    const cells = Array.from(row!.querySelectorAll('td'))
    expect(cells.filter((c) => c.textContent === '—').length).toBe(3)

    // 搜索框可用并按姓名过滤
    const search = screen.getByLabelText('搜索学生')
    fireEvent.change(search, { target: { value: '赵六' } })
    await waitFor(() => {
      expect(screen.getAllByText('赵六').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('张三')).toEqual([])
    })
  })
})
