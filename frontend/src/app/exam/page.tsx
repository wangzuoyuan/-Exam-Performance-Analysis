'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Loader2,
  Search,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react'

import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatCard } from '@/components/patterns/StatCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatGradeLabel } from '@/lib/labels'

interface Exam {
  id: number
  name: string
  grade: number
  semester?: string | null
  exam_date?: string | null
  exam_type?: string | null
}

interface ExamStats {
  total_students?: number | null
  avg_main_total?: number | null
  max_total?: number | null
  min_total?: number | null
  rank_min?: number | null
  rank_max?: number | null
}

interface ExamDetailResponse {
  stats?: ExamStats
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

async function responseDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail || fallback
  } catch {
    return fallback
  }
}

function formatNumber(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Number(n).toFixed(digits)
}

function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return String(Math.round(Number(n)))
}

function rankRange(stats: ExamStats | undefined): string {
  if (!stats || (stats.rank_min == null && stats.rank_max == null)) return '—'
  return `${formatInt(stats.rank_min)}–${formatInt(stats.rank_max)}`
}

export default function ExamListPage() {
  const { activeScope, loading: scopeLoading, error: scopeError } = useHomeroomScope()
  const [exams, setExams] = useState<Exam[]>([])
  const [statsById, setStatsById] = useState<Record<number, ExamStats>>({})
  const [statsErrors, setStatsErrors] = useState<Record<number, string>>({})
  const [query, setQuery] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Exam | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  useEffect(() => {
    if (scopeLoading) return

    if (!activeScope) {
      setExams([])
      setStatsById({})
      setStatsErrors({})
      setLoadError(null)
      setLoadState('idle')
      return
    }

    const controller = new AbortController()

    async function load() {
      setLoadState('loading')
      setLoadError(null)
      setExams([])
      setStatsById({})
      setStatsErrors({})

      try {
        const examsResponse = await fetch(`/api/exams?grade=${activeScope!.grade}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!examsResponse.ok) {
          throw new Error(await responseDetail(examsResponse, '无法读取考试列表'))
        }

        const examsPayload = (await examsResponse.json()) as { exams?: Exam[] }
        const nextExams = examsPayload.exams ?? []

        const detailEntries = await Promise.all(
          nextExams.map(async (exam) => {
            try {
              const response = await fetch(`/api/exams/${exam.id}`, {
                cache: 'no-store',
                signal: controller.signal,
              })
              if (!response.ok) {
                return {
                  id: exam.id,
                  error: await responseDetail(response, `统计加载失败 (${response.status})`),
                }
              }
              const detail = (await response.json()) as ExamDetailResponse
              return { id: exam.id, stats: detail.stats ?? {} }
            } catch (cause) {
              if (controller.signal.aborted) throw cause
              return {
                id: exam.id,
                error: cause instanceof Error ? cause.message : '统计加载失败',
              }
            }
          })
        )

        if (controller.signal.aborted) return
        setExams(nextExams)
        setStatsById(
          Object.fromEntries(
            detailEntries
              .filter((entry) => entry.stats !== undefined)
              .map((entry) => [entry.id, entry.stats as ExamStats]),
          ),
        )
        setStatsErrors(
          Object.fromEntries(
            detailEntries
              .filter((entry) => entry.error)
              .map((entry) => [entry.id, entry.error as string]),
          ),
        )
        setLoadState('ready')
      } catch (cause) {
        if (controller.signal.aborted) return
        setLoadError(cause instanceof Error ? cause.message : '无法读取考试列表')
        setLoadState('error')
      }
    }

    void load()
    return () => controller.abort()
  }, [activeScope?.classNum, activeScope?.grade, reloadKey, scopeLoading])

  useEffect(() => {
    setQuery('')
    setPendingDelete(null)
    setDeleteError(null)
  }, [activeScope?.classNum, activeScope?.grade])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/exams/${pendingDelete.id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(await responseDetail(response, `删除失败 (${response.status})`))
      }
      const deletedId = pendingDelete.id
      setExams((current) => current.filter((exam) => exam.id !== deletedId))
      setStatsById((current) => {
        const next = { ...current }
        delete next[deletedId]
        return next
      })
      setStatsErrors((current) => {
        const next = { ...current }
        delete next[deletedId]
        return next
      })
      setPendingDelete(null)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDeleting(false)
    }
  }

  const visibleExams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return exams
    return exams.filter((exam) =>
      [
        exam.name,
        exam.exam_date,
        exam.exam_type,
        exam.semester,
        formatGradeLabel(exam.grade),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    )
  }, [exams, query])

  const latest = exams[0] ?? null
  const latestStats = latest ? statsById[latest.id] : undefined
  const failedStatsCount = Object.keys(statsErrors).length
  const isLoading = scopeLoading || loadState === 'loading'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label ?? '班主任成绩分析'}
        title="考试分析"
        description="按当前年级查看已建档考试，进入详情后可查看学生成绩、排名与分数段。"
        actions={
          <Button asChild size="lg">
            <Link href="/upload">
              <Upload className="h-4 w-4" />
              上传新成绩
            </Link>
          </Button>
        }
      />

      {!scopeLoading && !activeScope ? (
        <StatePanel
          tone={scopeError ? 'error' : 'first-use'}
          title={scopeError ? '无法读取班级范围' : '请先绑定行政班'}
          description={scopeError || '考试列表只显示当前班主任已绑定年级的真实成绩数据。'}
          action={
            <Button asChild variant="outline" size="lg">
              <Link href="/upload">前往上传与班级绑定</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={<ClipboardList className="h-4 w-4" />}
              label="考试场次"
              value={isLoading ? '…' : exams.length}
              unit="场"
              helper={activeScope ? `${formatGradeLabel(activeScope.grade)}已建档考试` : '当前范围'}
              tone="primary"
            />
            <StatCard
              icon={<CalendarDays className="h-4 w-4" />}
              label="最近考试"
              value={
                <span className="line-clamp-2 break-words text-base leading-snug">
                  {isLoading ? '…' : latest?.name ?? '—'}
                </span>
              }
              helper={latest?.exam_date || '尚无考试日期'}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="最近主三门班均"
              value={isLoading ? '…' : formatNumber(latestStats?.avg_main_total)}
              unit={latest ? '分' : undefined}
              helper={
                latest
                  ? statsErrors[latest.id]
                    ? '统计加载失败，可重新加载'
                    : latestStats?.total_students == null
                    ? '学生数暂缺'
                    : `${formatInt(latestStats.total_students)} 名学生`
                  : '尚无可统计数据'
              }
              tone="accent"
            />
          </div>

          <SectionCard
            title="全部考试"
            description={
              loadState === 'ready'
                ? `当前范围共 ${exams.length} 场，点击考试名称查看学生明细。`
                : '正在读取当前年级的考试数据。'
            }
            action={
              <div className="relative w-44 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="按名称、日期或类型搜索"
                  aria-label="搜索考试"
                  className="h-11 pl-9"
                  disabled={loadState !== 'ready' || exams.length === 0}
                />
              </div>
            }
            contentClassName="px-0 pb-0"
          >
            {loadState === 'ready' && failedStatsCount > 0 ? (
              <div
                role="status"
                className="mx-4 mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800"
              >
                {failedStatsCount} 场考试的统计暂时不可用，考试列表仍可正常查看。可重新加载补齐统计。
              </div>
            ) : null}
            {isLoading ? (
              <StatePanel
                tone="loading"
                title="正在加载考试"
                description="正在同步考试列表与班级统计……"
                className="rounded-none border-x-0 border-b-0"
              />
            ) : loadState === 'error' ? (
              <StatePanel
                tone="error"
                title="考试列表加载失败"
                description={loadError || '请稍后重试。'}
                action={
                  <Button type="button" variant="outline" size="lg" onClick={reload}>
                    重新加载
                  </Button>
                }
                className="rounded-none border-x-0 border-b-0"
              />
            ) : exams.length === 0 ? (
              <StatePanel
                tone="empty"
                title="当前年级暂无考试"
                description="上传成绩并完成预览确认后，考试会出现在这里。"
                action={
                  <Button asChild size="lg">
                    <Link href="/upload">
                      <Upload className="h-4 w-4" />
                      上传第一场考试
                    </Link>
                  </Button>
                }
                className="rounded-none border-x-0 border-b-0"
              />
            ) : visibleExams.length === 0 ? (
              <StatePanel
                tone="empty"
                title="没有匹配的考试"
                description={`未找到与“${query.trim()}”相关的考试，可尝试缩短关键词。`}
                action={
                  <Button type="button" variant="outline" size="lg" onClick={() => setQuery('')}>
                    清除搜索
                  </Button>
                }
                className="rounded-none border-x-0 border-b-0"
              />
            ) : (
              <>
                <div className="hidden md:block [&>div]:max-h-[calc(100vh-15rem)]">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky top-0 z-10 min-w-64 bg-card">考试</TableHead>
                        <TableHead className="sticky top-0 z-10 w-24 bg-card">年级</TableHead>
                        <TableHead className="sticky top-0 z-10 w-28 bg-card">日期</TableHead>
                        <TableHead className="sticky top-0 z-10 w-32 bg-card text-right">主三门班均</TableHead>
                        <TableHead className="sticky top-0 z-10 w-36 bg-card text-right">班最高 / 最低</TableHead>
                        <TableHead className="sticky top-0 z-10 w-28 bg-card text-right">年级名次</TableHead>
                        <TableHead className="sticky top-0 z-10 w-28 bg-card text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleExams.map((exam) => (
                        <ExamTableRow
                          key={exam.id}
                          exam={exam}
                          stats={statsById[exam.id]}
                          statsError={statsErrors[exam.id]}
                          onDelete={() => {
                            setDeleteError(null)
                            setPendingDelete(exam)
                          }}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {visibleExams.map((exam) => (
                    <ExamMobileCard
                      key={exam.id}
                      exam={exam}
                      stats={statsById[exam.id]}
                      statsError={statsErrors[exam.id]}
                      onDelete={() => {
                        setDeleteError(null)
                        setPendingDelete(exam)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除考试</DialogTitle>
            <DialogDescription>
              确认删除「{pendingDelete?.name}」？该考试的学生成绩、班级均分与上传记录都会一并清除，操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-danger-600">{deleteError}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setPendingDelete(null)
                setDeleteError(null)
              }}
              disabled={deleting}
            >
              取消
            </Button>
            <Button variant="destructive" size="lg" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExamTableRow({ exam, stats, statsError, onDelete }: { exam: Exam; stats?: ExamStats; statsError?: string; onDelete: () => void }) {
  return (
    <TableRow>
      <TableCell className="max-w-sm align-top">
        <Link
          href={`/exam/${exam.id}`}
          className="inline-flex min-h-11 items-center break-words font-bold leading-snug text-foreground hover:text-primary"
        >
          {exam.name}
        </Link>
        <ExamBadges exam={exam} />
      </TableCell>
      <TableCell>{formatGradeLabel(exam.grade)}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{exam.exam_date || '—'}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {statsError ? <StatsUnavailable /> : formatNumber(stats?.avg_main_total)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {statsError ? <StatsUnavailable /> : `${formatInt(stats?.max_total)} / ${formatInt(stats?.min_total)}`}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {statsError ? <StatsUnavailable /> : rankRange(stats)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Link
            href={`/exam/${exam.id}`}
            aria-label={`查看${exam.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-primary hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`删除${exam.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ExamMobileCard({ exam, stats, statsError, onDelete }: { exam: Exam; stats?: ExamStats; statsError?: string; onDelete: () => void }) {
  return (
    <article className="min-w-0 px-4 py-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/exam/${exam.id}`}
            className="flex min-h-11 items-center break-words text-[15px] font-extrabold leading-snug text-foreground hover:text-primary"
          >
            {exam.name}
          </Link>
          <ExamBadges exam={exam} />
        </div>
        <span className="shrink-0 pt-3 text-xs text-muted-foreground tabular-nums">
          {exam.exam_date || '未设日期'}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/35 p-3">
        <MobileMetric label="主三门班均" value={statsError ? '不可用' : formatNumber(stats?.avg_main_total)} />
        <MobileMetric label="班最高 / 最低" value={statsError ? '不可用' : `${formatInt(stats?.max_total)} / ${formatInt(stats?.min_total)}`} />
        <MobileMetric label="年级名次" value={statsError ? '不可用' : rankRange(stats)} />
      </dl>
      {statsError ? <p className="mt-2 text-xs text-warning-700">统计加载失败，考试详情仍可打开。</p> : null}

      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="lg" className="min-w-0 flex-1">
          <Link href={`/exam/${exam.id}`}>
            查看详情
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-danger-600" onClick={onDelete} aria-label={`删除${exam.name}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </article>
  )
}

function StatsUnavailable() {
  return <span className="text-xs font-medium text-warning-700">不可用</span>
}

function ExamBadges({ exam }: { exam: Exam }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <Badge variant="secondary">{formatGradeLabel(exam.grade)}</Badge>
      {exam.semester ? <Badge variant="secondary">{exam.semester}</Badge> : null}
      {exam.exam_type ? <Badge variant="outline">{exam.exam_type}</Badge> : null}
    </div>
  )
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <dt className="min-h-8 text-[10px] font-semibold leading-tight text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xs font-extrabold text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
