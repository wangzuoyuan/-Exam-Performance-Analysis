// @vitest-environment jsdom

// 同名批量确认交互契约：无逐人 Dialog、唯一安全项默认「同一人」、异常项默认
// 稍后、多候选行内展开选择、新学生/稍后、一键提交载荷、错误保留选择、
// 成功结果与「撤销本次确认」，以及页面级接线（step2 自动加载 + 提交/撤销请求）。

import * as React from 'react'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AmbiguousBatchCard,
  BatchResultCard,
  type BatchResultData,
} from '../src/components/rollover/AmbiguousBatchCard'
import {
  buildDefaultDecisions,
  type AmbiguousStudent,
  type ConfirmBatchItemPayload,
} from '../src/lib/rollover-batch'
import { HomeroomScopeProvider } from '../src/components/providers/HomeroomScopeProvider'
import RolloverWizardPage from '../src/app/settings/rollover/page'

function cand(overrides: Record<string, unknown> = {}) {
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

const fixtureRows: AmbiguousStudent[] = [
  {
    student_id: 'g2_201',
    name: '陈一',
    candidates: [cand()],
  },
  {
    // 多候选：一个可用、一个已被关联
    student_id: 'g2_202',
    name: '王五',
    candidates: [
      cand({ student_id: 'g1_103', name: '王五', latest_main_score: 235, latest_main_rank: 22 }),
      cand({ student_id: 'g1_104', name: '王五', class_num: 5, latest_main_score: 198, latest_main_rank: 201, already_linked: true }),
    ],
  },
  {
    // 唯一候选但已被关联 -> 异常项
    student_id: 'g2_204',
    name: '赵六',
    candidates: [cand({ student_id: 'g1_105', name: '赵六', already_linked: true })],
  },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom 下 Radix Select 的可测交互序列：Enter 键打开 + 同步 click 选中。
// 弹层会在宏任务边界因焦点外移自动关闭，必须在一个同步序列内完成，
// 期间不得 await。
function pickSelectOption(trigger: HTMLElement, optionText: string) {
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  const option = Array.from(document.querySelectorAll('[role=option]')).find(
    (o) => o.textContent === optionText,
  )
  if (!option) throw new Error(`Select 选项「${optionText}」未找到`)
  fireEvent.click(option)
}

// 持有 decisions 状态的测试壳（与页面行为一致：默认选择来自 buildDefaultDecisions）
function renderCard(
  rows: AmbiguousStudent[] = fixtureRows,
  opts: { submitBusy?: boolean; submitError?: string | null; boundClassMatch?: boolean } = {},
) {
  const submitted: ConfirmBatchItemPayload[][] = []
  function Harness() {
    const [decisions, setDecisions] = useState(buildDefaultDecisions(rows, opts.boundClassMatch ?? true))
    return (
      <AmbiguousBatchCard
        rows={rows}
        grade={2}
        classNum={3}
        boundClassMatch={opts.boundClassMatch ?? true}
        decisions={decisions}
        onDecisionsChange={setDecisions}
        submitBusy={opts.submitBusy ?? false}
        onSubmit={(items) => submitted.push(items)}
        submitError={opts.submitError ?? null}
      />
    )
  }
  render(<Harness />)
  return { submitted }
}

function radio(id: string): HTMLInputElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`missing radio #${id}`)
  return el
}

describe('AmbiguousBatchCard 行内批量确认', () => {
  it('不弹任何 Dialog，也没有旧版「辨认」按钮；直接展示候选详情', () => {
    renderCard()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryAllByText(/辨认/)).toEqual([])
    // 唯一候选的行直接展示学号/原行政班/最近考试/主三门与名次
    expect(screen.getAllByText(/g1_101/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/原行政班：高一6班/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/主三门 240 分 \/ 名次 10/).length).toBeGreaterThan(0)
  })

  it('唯一安全项默认选「同一人」，异常项（多候选/候选被占用）默认稍后', () => {
    renderCard()
    expect(radio('confirm-g2_201-same').checked).toBe(true)
    expect(radio('confirm-g2_202-later').checked).toBe(true)
    expect(radio('confirm-g2_204-later').checked).toBe(true)
    expect(screen.getByText('安全项 1/3')).toBeTruthy()
    expect(screen.getByText('已选择 1')).toBeTruthy()
    expect(screen.getByText('稍后 2')).toBeTruthy()
  })

  it('有异常项时主按钮为「确认已选择的 N 人」；全部安全时为「确认关联全部 N 人」', () => {
    renderCard()
    expect(
      screen.getByRole('button', { name: '确认已选择的 1 人' }),
    ).toBeTruthy()

    cleanup()
    renderCard([fixtureRows[0]])
    expect(
      screen.getByRole('button', { name: '确认关联全部 1 人' }),
    ).toBeTruthy()
  })

  it('全部安全也只看当前决定：改成稍后/新学生后按钮退回「确认已选择的 N 人」', () => {
    renderCard([fixtureRows[0]]) // 唯一安全行 陈一，默认「同一人」
    expect(
      screen.getByRole('button', { name: '确认关联全部 1 人' }),
    ).toBeTruthy()

    // 改为稍后处理 -> 不再是「全部」
    fireEvent.click(radio('confirm-g2_201-later'))
    expect(
      screen.getByRole('button', { name: '确认已选择的 0 人' }),
    ).toBeTruthy()
    // 安全项徽标仍按结构性口径显示
    expect(screen.getByText('安全项 1/1')).toBeTruthy()

    // 改为新学生 -> 仍是「已选择」
    fireEvent.click(radio('confirm-g2_201-new'))
    expect(
      screen.getByRole('button', { name: '确认已选择的 1 人' }),
    ).toBeTruthy()
  })

  it('唯一候选学号与批内高二学号相同时不默认勾选（默认选择必被服务端拒绝）', () => {
    const rows: AmbiguousStudent[] = [
      fixtureRows[0], // 候选 g1_101 恰为下一行的 g2 学号
      {
        student_id: 'g1_101',
        name: '钱九',
        candidates: [cand({ student_id: 'g1_900', name: '钱九' })],
      },
    ]
    renderCard(rows)
    expect(screen.getByText('安全项 1/2')).toBeTruthy()
    expect(radio('confirm-g2_201-later').checked).toBe(true)
    expect(radio('confirm-g1_101-same').checked).toBe(true)
  })

  it('多候选行内展开选择；已被关联的候选择不可选', () => {
    renderCard()
    // 桌面表格与移动卡片各渲染一份展开按钮，取桌面（第一份）
    fireEvent.click(screen.getAllByRole('button', { name: /2 个高1候选，展开选择/ })[0])
    const free = radio('confirm-g2_202-cand-g1_103')
    const occupied = radio('confirm-g2_202-cand-g1_104')
    expect(occupied.disabled).toBe(true)
    fireEvent.click(free)
    expect(free.checked).toBe(true)
    expect(radio('confirm-g2_202-later').checked).toBe(false)
    expect(screen.getByText('已选择 2')).toBeTruthy()
  })

  it('可选「新学生」与改回「稍后处理」；一键提交携带准确载荷', () => {
    const { submitted } = renderCard()
    // 赵六：唯一候选被占用 -> 判为新学生
    fireEvent.click(radio('confirm-g2_204-new'))
    expect(radio('confirm-g2_204-new').checked).toBe(true)
    // 王五：展开后选择可用候选
    // 桌面表格与移动卡片各渲染一份展开按钮，取桌面（第一份）
    fireEvent.click(screen.getAllByRole('button', { name: /2 个高1候选，展开选择/ })[0])
    fireEvent.click(radio('confirm-g2_202-cand-g1_103'))
    // 陈一：默认同一人

    fireEvent.click(screen.getByRole('button', { name: '确认已选择的 3 人' }))
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toEqual([
      { g2_student_id: 'g2_201', name: '陈一', decision: 'link', g1_student_id: 'g1_101' },
      { g2_student_id: 'g2_202', name: '王五', decision: 'link', g1_student_id: 'g1_103' },
      { g2_student_id: 'g2_204', name: '赵六', decision: 'new', g1_student_id: null },
    ])
  })

  it('安全行也可改「稍后处理」，此时无人可提交、按钮禁用', () => {
    renderCard()
    fireEvent.click(radio('confirm-g2_201-later'))
    expect(radio('confirm-g2_201-later').checked).toBe(true)
    const submit = screen.getByRole('button', { name: '确认已选择的 0 人' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('提交失败提示错误且保留未提交的选择', () => {
    renderCard(fixtureRows, { submitError: '第 2 行：高1学号 g1_103 已被关联到其他学生，已拒绝' })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('已被关联到其他学生')
    // 未提交的选择仍在
    expect(radio('confirm-g2_201-same').checked).toBe(true)
    expect(screen.getByText('已选择 1')).toBeTruthy()
  })

  it('提交中禁用按钮（busy 状态）', () => {
    const { submitted } = renderCard(fixtureRows, { submitBusy: true })
    const submit = screen.getByRole('button', { name: /确认已选择的/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(submit)
    expect(submitted).toHaveLength(0)
  })

  it('教师未绑定当前班级时（boundClassMatch=false）不再默认勾选', () => {
    renderCard(fixtureRows, { boundClassMatch: false })
    expect(radio('confirm-g2_201-same').checked).toBe(false)
    expect(radio('confirm-g2_201-later').checked).toBe(true)
    expect(screen.getByText('安全项 0/3')).toBeTruthy()
  })
})

describe('BatchResultCard 结果与撤销', () => {
  const sample: BatchResultData = {
    batch_id: 'b-abc',
    grade: 2,
    class_num: 3,
    linked: 1,
    new_students: 1,
    results: [
      { g2_student_id: 'g2_201', name: '陈一', decision: 'link', g1_student_id: 'g1_101', identity_id: 12, status: 'linked' },
      { g2_student_id: 'g2_204', name: '赵六', decision: 'new', g1_student_id: null, identity_id: 13, status: 'new' },
    ],
  }

  it('显示关联/新学生/待处理结果，可撤销；撤销后按钮禁用', () => {
    const onUndo = vi.fn()
    const { rerender } = render(
      <BatchResultCard result={sample} remainingCount={2} undone={false} undoBusy={false} onUndo={onUndo} />,
    )
    expect(screen.getByText(/关联 1 人/)).toBeTruthy()
    expect(screen.getByText(/新学生 1 人/)).toBeTruthy()
    expect(screen.getByText(/待处理（留在页面）2 人/)).toBeTruthy()
    expect(screen.getByText('陈一')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '撤销本次确认' }))
    expect(onUndo).toHaveBeenCalledTimes(1)

    rerender(
      <BatchResultCard result={sample} remainingCount={2} undone undoBusy={false} onUndo={onUndo} />,
    )
    const disabled = screen.getByRole('button', { name: '已撤销' }) as HTMLButtonElement
    expect(disabled.disabled).toBe(true)
  })

  it('撤销中（undoBusy）按钮禁用', () => {
    render(
      <BatchResultCard result={sample} remainingCount={0} undone={false} undoBusy onUndo={() => {}} />,
    )
    expect(
      (screen.getByRole('button', { name: /撤销本次确认/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('RolloverWizardPage 页面接线', () => {
  const teacher = {
    id: 1,
    name: '测试老师',
    target_class_high1: 6,
    target_class_high2: 3,
    target_class_high3: null,
    has_pending_rollover: true,
    active_grade: 2,
  }
  const preview = {
    inherited: [],
    ambiguous: fixtureRows,
    new: [],
    unmatched: [],
    left_class: [],
    summary: { inherited: 0, ambiguous: 3, new: 0, unmatched: 0, left_class: 0 },
  }
  const batchOk: BatchResultData = {
    batch_id: 'b-page',
    grade: 2,
    class_num: 3,
    linked: 1,
    new_students: 0,
    results: [
      { g2_student_id: 'g2_201', name: '陈一', decision: 'link', g1_student_id: 'g1_101', identity_id: 21, status: 'linked' },
    ],
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  it('进入 step2 自动加载预览并渲染行内批量确认；提交与撤销走 confirm-batch 接口', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn<typeof fetch>((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${url}`)
      if (url.startsWith('/api/teacher')) return Promise.resolve(json(teacher))
      if (url.startsWith('/api/rollover/preview')) return Promise.resolve(json(preview))
      if (url.startsWith('/api/rollover/confirm-batch/')) return Promise.resolve(json({ batch_id: 'b-page', removed_aliases: [], removed_identities: [], skipped: [] }))
      if (url.startsWith('/api/rollover/confirm-batch')) {
        expect((init?.body as string) ?? '').toContain('"decision":"link"')
        return Promise.resolve(json(batchOk))
      }
      return Promise.resolve(json({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider>
        <RolloverWizardPage />
      </HomeroomScopeProvider>,
    )

    // 进入第 2 步（等 teacher 加载完成后 Tabs 渲染；无弹窗、无「辨认」）
    fireEvent.click(await screen.findByRole('button', { name: /下一步 · 逐人判定/ }))
    expect(await screen.findByText('安全项 1/3')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryAllByText(/辨认/)).toEqual([])

    // 一键提交（不再出现二次确认弹窗，直接请求）
    fireEvent.click(await screen.findByRole('button', { name: '确认已选择的 1 人' }))
    await waitFor(() => {
      expect(calls.some((c) => c === 'POST /api/rollover/confirm-batch')).toBe(true)
    })
    expect(await screen.findByText('本次确认结果')).toBeTruthy()

    // 只在向导步骤间来回切换时保留本批结果，用户仍可回来撤销。
    fireEvent.click(screen.getByRole('button', { name: /绑定与名册\s+设定目标行政班/ }))
    fireEvent.click(screen.getByRole('button', { name: /逐人判定\s+确认身份接续/ }))
    expect(await screen.findByText('本次确认结果')).toBeTruthy()

    // 撤销本次确认
    fireEvent.click(screen.getByRole('button', { name: '撤销本次确认' }))
    await waitFor(() => {
      expect(calls.some((c) => c === 'POST /api/rollover/confirm-batch/b-page/undo')).toBe(true)
    })
  })

  it('切换目标班级后：清空旧预览/选择/批次结果，自动请求新范围，绝不提交旧选择', async () => {
    const calls: string[] = []
    let confirmBatchCalls = 0
    const previewClass3 = {
      ...preview,
      ambiguous: [fixtureRows[0]], // 陈一：安全行
      summary: { ...preview.summary, ambiguous: 1 },
    }
    const previewClass4 = {
      ...preview,
      ambiguous: [
        { student_id: 'g2_401', name: '周七', candidates: [cand({ student_id: 'g1_401', name: '周七' })] },
      ],
      summary: { ...preview.summary, ambiguous: 1 },
    }
    const fetchMock = vi.fn<typeof fetch>((input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(`GET ${url}`)
      if (url.startsWith('/api/teacher')) return Promise.resolve(json(teacher))
      if (url.startsWith('/api/rollover/preview')) {
        const scope = url.includes('class_num=4') ? previewClass4 : previewClass3
        return Promise.resolve(json(scope))
      }
      if (url.startsWith('/api/rollover/confirm-batch')) {
        confirmBatchCalls += 1
        return Promise.resolve(json(batchOk))
      }
      return Promise.resolve(json({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider>
        <RolloverWizardPage />
      </HomeroomScopeProvider>,
    )

    // 进入 step2（班级 3）：加载并显示安全行，一键提交成功
    fireEvent.click(await screen.findByRole('button', { name: /下一步 · 逐人判定/ }))
    expect(await screen.findByText('安全项 1/1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认关联全部 1 人' }))
    expect(await screen.findByText('本次确认结果')).toBeTruthy()
    expect(confirmBatchCalls).toBe(1)

    // 回到 step1，把行政班从 3 改为 4（Radix Select 键盘打开 + 同步选中）
    fireEvent.click(screen.getByRole('button', { name: /设定目标行政班/ }))
    const classBox = screen.getByText('行政班', { exact: true }).parentElement!
    const classTrigger = classBox.querySelector('[role="combobox"]') as HTMLElement
    pickSelectOption(classTrigger, '4 班')

    // 再进 step2：必须请求新范围 class_num=4
    fireEvent.click(screen.getByRole('button', { name: /确认身份接续/ }))
    await waitFor(() => {
      expect(calls.some((c) => c.includes('/api/rollover/preview?grade=2&class_num=4'))).toBe(true)
    })

    // 旧范围的批次结果与撤销入口不再显示；新范围按教师绑定（3班）判为未绑定班级
    await waitFor(() => {
      expect(screen.queryByText(/本次确认结果/)).toBeNull()
      expect(screen.queryByRole('button', { name: '撤销本次确认' })).toBeNull()
      expect(screen.queryByText(/同名批量确认完成/)).toBeNull()
    })
    expect(await screen.findByText('安全项 0/1')).toBeTruthy()
    // 新范围行按最新数据重建默认选择（稍后），陈一的旧选择不会被带过来提交
    expect(radio('confirm-g2_401-later').checked).toBe(true)
    expect(confirmBatchCalls).toBe(1)
  })
})
