'use client'

// 同名待确认 · 行内批量确认卡（替代旧版逐行「辨认」Dialog）。
// 每行行内单选：同一人 / 新学生 / 稍后处理；多候选时行内展开候选列表选择，
// 全程不弹窗。严格安全项默认选「同一人」，顶部汇总安全项/已选择数量，
// 主按钮直接提交（不再二次确认）。结果与撤销由 BatchResultCard 呈现。

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, ShieldCheck, Undo2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatClassLabel } from '@/lib/labels'
import {
  buildSubmitItems,
  computeSafeRows,
  isDecisionReady,
  type AmbiguousCandidate,
  type AmbiguousStudent,
  type ConfirmBatchItemPayload,
  type ConfirmDecision,
} from '@/lib/rollover-batch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatePanel } from '@/components/patterns/StatePanel'

const DASH = '—'

export interface BatchResultData {
  batch_id: string
  grade: number
  class_num: number
  linked: number
  new_students: number
  results: Array<{
    g2_student_id: string
    name: string | null
    decision: 'link' | 'new'
    g1_student_id: string | null
    identity_id: number
    status: 'linked' | 'new'
  }>
}

export interface AmbiguousBatchCardProps {
  rows: AmbiguousStudent[]
  grade: number
  classNum: number | null
  /** 当前预览班级是否恰为教师绑定的目标年级行政班（严格安全项的前提） */
  boundClassMatch: boolean
  decisions: Record<string, ConfirmDecision>
  onDecisionsChange: (decisions: Record<string, ConfirmDecision>) => void
  submitBusy: boolean
  onSubmit: (items: ConfirmBatchItemPayload[]) => void
  submitError: string | null
}

export function AmbiguousBatchCard({
  rows,
  grade,
  classNum,
  boundClassMatch,
  decisions,
  onDecisionsChange,
  submitBusy,
  onSubmit,
  submitError,
}: AmbiguousBatchCardProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const safe = useMemo(() => computeSafeRows(rows, boundClassMatch), [rows, boundClassMatch])
  const items = useMemo(() => buildSubmitItems(rows, decisions), [rows, decisions])
  const selectedCount = items.length
  const laterCount = rows.length - selectedCount
  const allSafe = rows.length > 0 && safe.size === rows.length
  // 「确认关联全部」只在所有行都是严格安全项、且当前没有任何一行被改成
  // 新学生/稍后时出现；用户改动了任一行就退回「确认已选择的 N 人」。
  // （安全项徽标仍按结构性口径 allSafe 显示）
  const showConfirmAll =
    allSafe &&
    rows.every(
      (r) =>
        decisions[r.student_id]?.choice === 'link' &&
        !!decisions[r.student_id]?.g1_student_id,
    )

  function setDecision(sid: string, decision: ConfirmDecision) {
    onDecisionsChange({ ...decisions, [sid]: decision })
  }

  function toggleExpanded(sid: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  function chooseSamePerson(row: AmbiguousStudent) {
    if (row.candidates.length === 1) {
      setDecision(row.student_id, {
        choice: 'link',
        g1_student_id: row.candidates[0].student_id,
      })
    } else {
      // 多候选：先展开列表，选了具体候选才算「同一人」
      setExpanded((prev) => new Set(prev).add(row.student_id))
    }
  }

  function handleSubmit() {
    if (selectedCount === 0 || submitBusy) return
    onSubmit(items)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              同名待确认
              <Badge variant="warning">同名待确认</Badge>
              <span className="text-sm font-normal text-slate-400">{rows.length}</span>
            </CardTitle>
            <CardDescription>
              高{grade}（{classNum ?? DASH}班）与高{grade - 1}同名但学号不同的学生。在行内直接选择判定，
              安全项已默认选「同一人」；多候选的行展开后选具体的人。
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2" role="status">
              <Badge variant={allSafe ? 'success' : 'warning'}>
                安全项 {safe.size}/{rows.length}
              </Badge>
              <Badge variant="outline">已选择 {selectedCount}</Badge>
              <Badge variant="secondary">稍后 {laterCount}</Badge>
            </div>
            <Button onClick={handleSubmit} disabled={submitBusy || selectedCount === 0}>
              {submitBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {showConfirmAll
                ? `确认关联全部 ${selectedCount} 人`
                : `确认已选择的 ${selectedCount} 人`}
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          安全项 = 姓名一致、高{grade - 1}恰好一个同名候选且未被关联、当前班级与教师绑定一致、
          本批学号不重复。点击按钮直接提交，服务端会再次整批核验，任一冲突整批拒绝（不会写一半）。
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {submitError && (
          <StatePanel tone="error" title="批量确认失败" description={submitError} />
        )}
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">暂无同名待确认</div>
        ) : (
          <>
            {/* 桌面表格 */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">高{grade}学生</TableHead>
                    <TableHead>高{grade - 1}候选</TableHead>
                    <TableHead className="w-80">判定</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <AmbiguousRowDesktop
                      key={row.student_id}
                      row={row}
                      grade={grade}
                      safe={safe.has(row.student_id)}
                      decision={decisions[row.student_id]}
                      expanded={expanded.has(row.student_id)}
                      onToggleExpanded={toggleExpanded}
                      onChooseSamePerson={chooseSamePerson}
                      onPickCandidate={(g1) =>
                        setDecision(row.student_id, { choice: 'link', g1_student_id: g1 })
                      }
                      onNew={() => setDecision(row.student_id, { choice: 'new' })}
                      onLater={() => setDecision(row.student_id, { choice: 'later' })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* 移动卡片 */}
            <div className="space-y-2 md:hidden">
              {rows.map((row) => (
                <AmbiguousRowMobile
                  key={row.student_id}
                  row={row}
                  grade={grade}
                  safe={safe.has(row.student_id)}
                  decision={decisions[row.student_id]}
                  expanded={expanded.has(row.student_id)}
                  onToggleExpanded={toggleExpanded}
                  onChooseSamePerson={chooseSamePerson}
                  onPickCandidate={(g1) =>
                    setDecision(row.student_id, { choice: 'link', g1_student_id: g1 })
                  }
                  onNew={() => setDecision(row.student_id, { choice: 'new' })}
                  onLater={() => setDecision(row.student_id, { choice: 'later' })}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 行级判定单选组（桌面/移动共用；groupBase 按变体区分，避免重复 id） ───

interface RowRadioProps {
  row: AmbiguousStudent
  groupBase: string
  decision: ConfirmDecision | undefined
  onChooseSamePerson: (row: AmbiguousStudent) => void
  onNew: () => void
  onLater: () => void
}

function DecisionRadioGroup({
  row,
  groupBase,
  decision,
  onChooseSamePerson,
  onNew,
  onLater,
}: RowRadioProps) {
  const sid = row.student_id
  const sameChecked = decision?.choice === 'link' && !!decision.g1_student_id
  const multi = row.candidates.length > 1
  return (
    <div
      role="radiogroup"
      aria-label={`判定：${row.name ?? sid}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1"
    >
      <DecisionRadio
        id={`${groupBase}-same`}
        name={groupBase}
        checked={sameChecked}
        onChange={() => onChooseSamePerson(row)}
        label={multi ? '同一人（展开选择）' : '同一人'}
      />
      <DecisionRadio
        id={`${groupBase}-new`}
        name={groupBase}
        checked={decision?.choice === 'new'}
        onChange={onNew}
        label="新学生"
      />
      <DecisionRadio
        id={`${groupBase}-later`}
        name={groupBase}
        checked={decision?.choice === 'later' || !isDecisionReady(decision)}
        onChange={onLater}
        label="稍后处理"
      />
    </div>
  )
}

function DecisionRadio({
  id,
  name,
  checked,
  onChange,
  label,
  disabled = false,
  title,
}: {
  id: string
  name: string
  checked: boolean
  onChange: () => void
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <label
      htmlFor={id}
      title={title}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] font-medium md:min-h-0 md:py-2',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="radio"
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 accent-brand-600"
      />
      {label}
    </label>
  )
}

// ─── 候选信息（学号 / 原行政班 / 最近考试 / 主三门成绩与名次） ───

function CandidateInfo({ candidate, grade }: { candidate: AmbiguousCandidate; grade: number }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{candidate.name}</span>
        {candidate.already_linked && (
          <Badge variant="secondary" title={`该高${grade - 1}学号已被关联到别人`}>
            已被关联
          </Badge>
        )}
      </div>
      <div className="font-mono text-xs text-slate-500">
        高{grade - 1}学号 {candidate.student_id}
      </div>
      <div className="text-xs text-slate-500">
        原行政班：{formatClassLabel(grade - 1, candidate.class_num) ?? DASH}
        {' · '}
        {candidate.latest_exam_name ?? '无考试'}：主三门{' '}
        {candidate.latest_main_score ?? DASH} 分 / 名次 {candidate.latest_main_rank ?? DASH}
      </div>
    </div>
  )
}

// ─── 多候选行内展开列表 ───

function CandidateList({
  row,
  grade,
  groupBase,
  decision,
  onPickCandidate,
}: {
  row: AmbiguousStudent
  grade: number
  groupBase: string
  decision: ConfirmDecision | undefined
  onPickCandidate: (g1: string) => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs text-slate-500">
        高{grade - 1}有 {row.candidates.length} 个同名候选，请选择与高{grade}学生为同一人的那一个
        （对比原行政班与最近成绩）：
      </p>
      {row.candidates.map((candidate) => (
        <label
          key={candidate.student_id}
          htmlFor={`${groupBase}-cand-${candidate.student_id}`}
          title={
            candidate.already_linked ? `该高${grade - 1}学号已被关联到别人` : undefined
          }
          className={cn(
            'flex cursor-pointer items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-3',
            candidate.already_linked && 'cursor-not-allowed opacity-60',
          )}
        >
          <CandidateInfo candidate={candidate} grade={grade} />
          {/* 候选择独立成组（与三态判定分开）：React 更新受控 radio 时会把同
              name 组内其它 radio 置否，共用一个 name 会把刚选中的候选清掉 */}
          <input
            type="radio"
            id={`${groupBase}-cand-${candidate.student_id}`}
            name={`${groupBase}-cand`}
            checked={
              decision?.choice === 'link' && decision.g1_student_id === candidate.student_id
            }
            onChange={() => onPickCandidate(candidate.student_id)}
            disabled={candidate.already_linked}
            className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
          />
        </label>
      ))}
    </div>
  )
}

// ─── 桌面行（多候选时追加展开子行） ───

function AmbiguousRowDesktop({
  row,
  grade,
  safe,
  decision,
  expanded,
  onToggleExpanded,
  onChooseSamePerson,
  onPickCandidate,
  onNew,
  onLater,
}: {
  row: AmbiguousStudent
  grade: number
  safe: boolean
  decision: ConfirmDecision | undefined
  expanded: boolean
  onToggleExpanded: (sid: string) => void
  onChooseSamePerson: (row: AmbiguousStudent) => void
  onPickCandidate: (g1: string) => void
  onNew: () => void
  onLater: () => void
}) {
  const multi = row.candidates.length > 1
  const groupBase = `confirm-${row.student_id}`
  return (
    <>
      <TableRow className="hover:bg-slate-50">
        <TableCell>
          <div className="font-medium">{row.name ?? DASH}</div>
          <div className="font-mono text-xs text-slate-500">{row.student_id}</div>
          {safe && (
            <Badge variant="success" className="mt-1">
              安全项
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {multi ? (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={expanded}
              aria-controls={`candidates-${groupBase}`}
              onClick={() => onToggleExpanded(row.student_id)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {row.candidates.length} 个高{grade - 1}候选，展开选择
            </Button>
          ) : (
            <CandidateInfo candidate={row.candidates[0]} grade={grade} />
          )}
        </TableCell>
        <TableCell>
          <DecisionRadioGroup
            row={row}
            groupBase={groupBase}
            decision={decision}
            onChooseSamePerson={onChooseSamePerson}
            onNew={onNew}
            onLater={onLater}
          />
        </TableCell>
      </TableRow>
      {multi && expanded && (
        <TableRow id={`candidates-${groupBase}`}>
          <TableCell colSpan={3} className="bg-slate-50/40 pb-4">
            <CandidateList
              row={row}
              grade={grade}
              groupBase={groupBase}
              decision={decision}
              onPickCandidate={onPickCandidate}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ─── 移动卡片 ───

function AmbiguousRowMobile({
  row,
  grade,
  safe,
  decision,
  expanded,
  onToggleExpanded,
  onChooseSamePerson,
  onPickCandidate,
  onNew,
  onLater,
}: {
  row: AmbiguousStudent
  grade: number
  safe: boolean
  decision: ConfirmDecision | undefined
  expanded: boolean
  onToggleExpanded: (sid: string) => void
  onChooseSamePerson: (row: AmbiguousStudent) => void
  onPickCandidate: (g1: string) => void
  onNew: () => void
  onLater: () => void
}) {
  const multi = row.candidates.length > 1
  const groupBase = `confirm-m-${row.student_id}`
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.name ?? DASH}</span>
            {safe && <Badge variant="success">安全项</Badge>}
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500">{row.student_id}</div>
        </div>
      </div>
      {multi ? (
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls={`candidates-${groupBase}`}
          onClick={() => onToggleExpanded(row.student_id)}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {row.candidates.length} 个高{grade - 1}候选，展开选择
        </Button>
      ) : (
        <CandidateInfo candidate={row.candidates[0]} grade={grade} />
      )}
      <DecisionRadioGroup
        row={row}
        groupBase={groupBase}
        decision={decision}
        onChooseSamePerson={onChooseSamePerson}
        onNew={onNew}
        onLater={onLater}
      />
      {multi && expanded && (
        <div id={`candidates-${groupBase}`}>
          <CandidateList
            row={row}
            grade={grade}
            groupBase={groupBase}
            decision={decision}
            onPickCandidate={onPickCandidate}
          />
        </div>
      )}
    </div>
  )
}

// ─── 提交结果 + 撤销本次确认 ───

export function BatchResultCard({
  result,
  remainingCount,
  undone,
  undoBusy,
  onUndo,
}: {
  result: BatchResultData
  remainingCount: number
  undone: boolean
  undoBusy: boolean
  onUndo: () => void
}) {
  return (
    <Card className="border-success-500/40 bg-success-50/50">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-success-600" />
              本次确认结果
            </CardTitle>
            <CardDescription>
              关联 {result.linked} 人 · 新学生 {result.new_students} 人 ·
              待处理（留在页面）{remainingCount} 人。冲突为 0（任一冲突整批都不会提交）。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={onUndo}
            disabled={undoBusy || undone}
          >
            {undoBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="h-4 w-4" />
            )}
            {undone ? '已撤销' : '撤销本次确认'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {result.results.map((r) => (
            <li key={r.g2_student_id} className="flex flex-wrap items-baseline gap-1">
              <span className="font-medium">{r.name ?? r.g2_student_id}</span>
              <span className="text-slate-500">
                {r.status === 'linked' ? (
                  <>
                    同一人 · 高{result.grade - 1}学号{' '}
                    <span className="font-mono">{r.g1_student_id}</span>
                  </>
                ) : (
                  '新学生（独立身份）'
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          撤销只解除本次新建的关联，不会影响此前已经存在的关联。
        </p>
      </CardContent>
    </Card>
  )
}
