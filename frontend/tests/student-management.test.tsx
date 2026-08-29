// @vitest-environment jsdom

// 学生管理页 UI 契约：当前班作用域请求、新增/编辑/学号管理载荷、删除影响
// 预览与二次确认门控、合并冲突阻止、主档回填横幅、移动卡片操作入口。

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
  target_class_high3: 6,
  active_grade: 2,
}

function makeStudents() {
  return [
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
      counts: { subject_score: 2, total_score: 1, homework: 1, special: 0, note: 1 },
      latest_exam_name: '高二开学测',
      latest_main_score: 261,
      latest_main_rank: 12,
    },
    {
      student_id: '20250202',
      name: '李四',
      name_source: 'roster',
      gender: null,
      seat_no: 2,
      note: null,
      excluded: 0,
      status: null,
      in_roster: true,
      identity_id: 7,
      aliases: [{ student_id: 'g1_002', grade: 1, class_num: 6 }],
      counts: { subject_score: 0, total_score: 0, homework: 0, special: 0, note: 0 },
      latest_exam_name: null,
      latest_main_score: null,
      latest_main_rank: null,
    },
  ]
}

interface Call {
  url: string
  method: string
  body?: unknown
}

function setupFetch(overrides: {
  students?: ReturnType<typeof makeStudents>
  mergePreview?: unknown
  deletePreview?: unknown
}) {
  const calls: Call[] = []
  const fetchMock = vi.fn<typeof fetch>((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    const json = (payload: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }))

    if (url.startsWith('/api/teacher')) return json(teacher)
    if (url.startsWith('/api/manage/change-log')) return json([])
    if (/^\/api\/manage\/students(\?|$)/.test(url) && method === 'GET')
      return json(overrides.students ?? makeStudents())
    if (url === '/api/manage/students' && method === 'POST') return json({ student_id: 'TMP-2-6-新同学', identity_id: 11 })
    if (url === '/api/manage/backfill-identities' && method === 'POST') return json({ created: 1, skipped: 0, total: 1 })
    if (url.includes('/delete-preview')) return json(overrides.deletePreview ?? {
      student_id: '20250201',
      counts: { subject_score: 2, total_score: 1, homework: 1, special: 0, note: 1 },
      total_refs: 5,
      requires_confirm: true,
      other_aliases_kept: ['g1_001'],
      imported_history_kept: 2,
    })
    if (url === '/api/manage/students/20250201' && method === 'DELETE') return json({ deleted: true })
    if (url === '/api/manage/students/20250201' && method === 'PUT') return json({ changed: {} })
    if (url.endsWith('/correct-sid')) return json({ old_student_id: '20250201', new_student_id: body?.new_student_id })
    if (url.endsWith('/new-year-sid')) return json({ student_id: body?.new_student_id, created: true })
    if (url.endsWith('/archive')) return json({ status: body?.status })
    if (url === '/api/manage/students/merge-preview') return json(overrides.mergePreview ?? { conflicts: [], mergeable: true })
    if (url === '/api/manage/students/merge') return json({ merged: true })
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function renderPage() {
  return render(
    <HomeroomScopeProvider>
      <StudentManagePage />
    </HomeroomScopeProvider>
  )
}

// jsdom 下 Radix Select 的可测交互序列：Enter 键打开 + 同步 click 选中。
function pickSelectOption(trigger: HTMLElement, optionText: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' })
  const option = Array.from(document.querySelectorAll('[role=option]')).find(
    (el) => (el.textContent ?? '').includes(optionText)
  )
  if (!option) throw new Error(`Select 选项「${optionText}」未找到`)
  fireEvent.click(option)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StudentManagePage 契约', () => {
  it('管理列表走当前班作用域端点，并渲染桌面表格与移动卡片', async () => {
    const calls = setupFetch({})
    renderPage()

    // 作用域契约：列表请求发给 /api/manage/students（服务端强制当前绑定班级）
    await waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/manage/students?') || c.url === '/api/manage/students')).toBe(true)
    })
    expect(await screen.findAllByText('张三')).toBeTruthy()
    expect(screen.getAllByLabelText('删除张三').length).toBe(2) // 桌面表格 + 移动卡片各一份
    expect(screen.getAllByLabelText('编辑张三').length).toBe(2)
    expect(screen.getAllByLabelText('学号管理张三').length).toBe(2)
    // 移动卡片视图存在且包含学生
    const card = document.querySelector('article')
    expect(card?.textContent).toContain('张三')
    expect(card?.textContent).toContain('20250201')
  })

  it('新增学生：提交规范姓名等字段到管理端点', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /新增学生/ }))
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '新同学' } })
    fireEvent.change(screen.getByLabelText('学号（选填）'), { target: { value: '20250399' } })
    fireEvent.click(screen.getByRole('button', { name: '创建学生' }))

    await waitFor(() => {
      const post = calls.find((c) => c.url === '/api/manage/students' && c.method === 'POST')
      expect(post).toBeTruthy()
      expect(post!.body).toMatchObject({ name: '新同学', student_id: '20250399' })
    })
  })

  it('编辑学生：规范姓名写主档端点', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click((await screen.findAllByLabelText('编辑张三'))[0])
    fireEvent.change(screen.getByLabelText('规范姓名'), { target: { value: '张三丰' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      const put = calls.find((c) => c.url === '/api/manage/students/20250201' && c.method === 'PUT')
      expect(put).toBeTruthy()
      expect(put!.body).toMatchObject({ name: '张三丰' })
    })
    // 基本信息 + 在班状态单次请求原子提交：绝不向 archive 端点发第二个请求
    expect(calls.some((c) => c.url.endsWith('/archive'))).toBe(false)
    expect(calls.filter((c) => c.url === '/api/manage/students/20250201').length).toBe(1)
  })

  it('编辑学生：在班状态随同一次 PUT 提交', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click((await screen.findAllByLabelText('编辑张三'))[0])
    const statusTrigger = screen.getByLabelText(/在班状态/)
    pickSelectOption(statusTrigger as HTMLElement, '转班离班')
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      const put = calls.find((c) => c.url === '/api/manage/students/20250201' && c.method === 'PUT')
      expect(put).toBeTruthy()
      expect(put!.body).toMatchObject({ status: 'transferred' })
    })
    expect(calls.some((c) => c.url.endsWith('/archive'))).toBe(false)
  })

  it('纠正学号：成功后关闭对话框并刷新名单', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click((await screen.findAllByLabelText('学号管理张三'))[0])
    fireEvent.change(screen.getByLabelText('纠正后的新学号'), { target: { value: '20250215' } })
    fireEvent.click(screen.getByRole('button', { name: '纠正学号' }))

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/correct-sid'))
      expect(post).toBeTruthy()
      expect(post!.body).toMatchObject({ new_student_id: '20250215' })
    })
    // 旧 student_id 已失效：对话框必须关闭，不能继续持有旧号
    await waitFor(() => {
      expect(screen.queryByLabelText('纠正后的新学号')).toBeNull()
    })
    // 名单已刷新
    await waitFor(() => {
      expect(calls.filter((c) => /^\/api\/manage\/students(\?|$)/.test(c.url) && c.method === 'GET').length).toBeGreaterThan(1)
    })
  })

  it('新增学年学号：成功后同样关闭对话框', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click((await screen.findAllByLabelText('学号管理张三'))[0])
    fireEvent.change(screen.getByLabelText('新学年学号'), { target: { value: '20250301' } })
    fireEvent.click(screen.getByRole('button', { name: '添加学号' }))

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/new-year-sid'))
      expect(post).toBeTruthy()
      expect(post!.body).toMatchObject({ new_student_id: '20250301', grade: 3, class_num: 6 })
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('新学年学号')).toBeNull()
    })
  })

  it('删除：先展示影响计数，确认后才允许删除', async () => {
    const calls = setupFetch({})
    renderPage()

    fireEvent.click((await screen.findAllByLabelText('删除张三'))[0])

    // 影响计数先展示
    const impact = await screen.findByTestId('delete-impact')
    await waitFor(() => {
      expect(impact.textContent).toContain('单科成绩 2')
      expect(impact.textContent).toContain('档案 1')
    })
    expect(impact.textContent).toContain('自动打包备份')
    // 历史学号与导入历史的保留情况也要讲清楚，避免误解为会一并删除
    const retention = await screen.findByTestId('delete-retention')
    await waitFor(() => {
      expect(retention.textContent).toContain('g1_001')
      expect(retention.textContent).toContain('历史学号')
      expect(retention.textContent).toContain('2 条')
    })

    // 确认按钮在预览就绪后可点，载荷必须带 confirm=true
    const confirmBtn = screen.getByRole('button', { name: '确认删除' }) as HTMLButtonElement
    await waitFor(() => expect(confirmBtn.disabled).toBe(false))
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      const del = calls.find((c) => c.method === 'DELETE')
      expect(del).toBeTruthy()
      expect(del!.body).toMatchObject({ confirm: true })
    })
  })

  it('合并：同场考试冲突时明确提示并阻止确认', async () => {
    const calls = setupFetch({
      mergePreview: {
        primary: { student_id: '20250201', name: '张三', counts: { subject_score: 2, total_score: 1, homework: 1, special: 0, note: 1 } },
        duplicate: { student_id: '20250202', name: '李四', counts: { subject_score: 0, total_score: 0, homework: 0, special: 0, note: 0 } },
        conflicts: [{ exam_id: 201, exam_name: '高二开学测' }],
        mergeable: false,
        message: '两个学号在同一场考试都有成绩，无法自动合并；请先用「纠正学号」核对归属',
      },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /合并重复学生/ }))
    const triggers = screen.getAllByRole('combobox')
    pickSelectOption(triggers[0], '20250201')
    pickSelectOption(triggers[1], '20250202')
    fireEvent.click(screen.getByRole('button', { name: '预览合并影响' }))

    const preview = await screen.findByTestId('merge-preview')
    await waitFor(() => {
      expect(preview.textContent).toContain('无法自动合并')
      expect(preview.textContent).toContain('高二开学测')
    })
    expect((screen.getByRole('button', { name: '确认合并' }) as HTMLButtonElement).disabled).toBe(true)
    expect(calls.some((c) => c.url === '/api/manage/students/merge' && c.method === 'POST')).toBe(false)
  })

  it('主档回填横幅：展示待回填人数并可一键回填', async () => {
    const calls = setupFetch({})
    renderPage()

    const banner = await screen.findByText(/1 名学生尚未建立跨学年主档/)
    expect(banner).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /一键建立主档/ }))
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/manage/backfill-identities' && c.method === 'POST')).toBe(true)
    })
  })

  it('已归档学生默认不请求，切换后才带 include_archived', async () => {
    const calls = setupFetch({})
    renderPage()

    await screen.findAllByText('张三')
    const listCalls = () => calls.filter((c) => c.url.startsWith('/api/manage/students') && c.method === 'GET')
    expect(listCalls().every((c) => !c.url.includes('include_archived'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '显示已归档' }))
    await waitFor(() => {
      expect(listCalls().some((c) => c.url.includes('include_archived=true'))).toBe(true)
    })
  })

  it('手机端：归档开关可见、卡片只有一个画像入口、变更记录随操作刷新', async () => {
    const calls = setupFetch({})
    renderPage()

    // 归档切换按钮在手机端不因 sm 断点被隐藏
    const toggle = await screen.findByRole('button', { name: '显示已归档' })
    expect(toggle.className).not.toMatch(/(^|\s)hidden(\s|$)/)

    // 移动卡片：通往 /student/:id 的入口只有底部「画像」按钮一处
    await screen.findAllByText('张三')
    const card = document.querySelector('article')
    expect(card?.querySelectorAll('a[href="/student/20250201"]').length).toBe(1)

    // 变更记录随操作刷新：初始 1 次 + 编辑保存后再拉取
    const logCalls = () => calls.filter((c) => c.url.startsWith('/api/manage/change-log'))
    expect(logCalls().length).toBe(1)
    fireEvent.click(screen.getAllByLabelText('编辑张三')[0])
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => {
      expect(logCalls().length).toBeGreaterThan(1)
    })
  })
})
