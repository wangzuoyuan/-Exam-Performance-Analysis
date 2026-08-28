// @vitest-environment jsdom

// 学生检索页 roster-only 呈现契约：仅有花名册、尚无成绩的高二学生也出现在
// 当前班名单里，成绩/名次/最近考试显示「—」，且可按姓名搜索。

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HomeroomScopeProvider } from '../src/components/providers/HomeroomScopeProvider'
import StudentSearchPage from '../src/app/student/page'

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
    current_grade: 2,
    class_num: 6,
    history: [],
    latest_exam_name: '高二开学测',
    latest_main_score: 261,
    latest_main_rank: 12,
  },
  {
    student_id: 'TMP-2-6-赵六',
    name: '赵六',
    current_grade: 2,
    class_num: 6,
    history: [],
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

describe('StudentSearchPage roster-only students', () => {
  it('显示仅有花名册的学生，空成绩字段用「—」且不显示为 0', async () => {
    const fetchMock = vi.fn<typeof fetch>((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/teacher')) return Promise.resolve(jsonResponse(teacher))
      if (url.startsWith('/api/students')) return Promise.resolve(jsonResponse(students))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider>
        <StudentSearchPage />
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
