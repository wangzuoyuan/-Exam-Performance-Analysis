'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Bot,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  RefreshCw,
  Search,
  School,
  Upload,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import BackupCard from '@/components/BackupCard'
import WeeklyFocusCard from '@/components/WeeklyFocusCard'
import { ChartPanel } from '@/components/charts/ChartPanel'
import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { StatCard } from '@/components/patterns/StatCard'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface Exam {
  id: number
  name: string
  grade: number
  exam_date: string
  exam_type?: string | null
  semester?: string | null
}

interface TotalTypeStats {
  avg?: number | null
}

interface ExamStats {
  avg_main_total?: number | null
  rank_min?: number | null
  rank_max?: number | null
  by_total_type?: Record<string, TotalTypeStats | undefined> | null
}

interface FocusStudent {
  student_id: string
  name: string
  issues: string[]
}

interface HomeworkKpi {
  total_misses: number
  worst_subject: { name: string; count: number }
  top_students: { name: string; count: number }[]
}

interface HomeworkWarnings {
  counts: { serious: number; warning: number; students: number }
}

interface DashboardSnapshot {
  exams: Exam[]
  statsById: Record<number, ExamStats>
  focusList: FocusStudent[]
  focusError: boolean
  homeworkKpi: HomeworkKpi | null
  homeworkWarnings: HomeworkWarnings | null
  homeworkError: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`请求失败 (${response.status})`)
  return (await response.json()) as T
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function formatRankRange(stats: ExamStats | undefined): string {
  if (stats?.rank_min == null && stats?.rank_max == null) return '—'
  const min = stats?.rank_min == null ? '—' : Math.round(Number(stats.rank_min))
  const max = stats?.rank_max == null ? '—' : Math.round(Number(stats.rank_max))
  return `${min}–${max}`
}

function totalAverage(stats: ExamStats | undefined, type: string): string {
  return formatNumber(stats?.by_total_type?.[type]?.avg)
}

function formatDate(value?: string | null): string {
  if (!value) return '日期未填写'
  return value.replaceAll('-', '.')
}

export default function Dashboard() {
  const { activeScope, loading: scopeLoading, teacher } = useHomeroomScope()
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [reloadKey, setReloadKey] = useState(0)
  const requestIdRef = useRef(0)

  const load = useCallback(() => setReloadKey((value) => value + 1), [])

  useEffect(() => {
    if (scopeLoading) return
    if (!activeScope) {
      requestIdRef.current += 1
      setSnapshot(null)
      setState('ready')
      return
    }

    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const { grade, classNum } = activeScope
    setSnapshot(null)
    setState('loading')

    async function loadDashboard() {
      try {
        const examsResponse = await fetchJson<{ exams?: Exam[] }>(`/api/exams?grade=${grade}`, controller.signal)
        const exams = examsResponse.exams ?? []
        const displayedExams = exams.slice(0, 8)

        const detailEntries = await Promise.all(
          displayedExams.map(async (exam) => {
            try {
              const detail = await fetchJson<{ stats?: ExamStats }>(`/api/exams/${exam.id}`, controller.signal)
              return [exam.id, detail.stats ?? {}] as const
            } catch (cause) {
              if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
              return [exam.id, {}] as const
            }
          })
        )

        let focusList: FocusStudent[] = []
        let focusError = false
        if (displayedExams[0]) {
          try {
            const focus = await fetchJson<{ focus_list?: FocusStudent[] }>(
              `/api/focus-list/${displayedExams[0].id}?class_num=${classNum}`,
              controller.signal
            )
            focusList = focus.focus_list ?? []
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
            focusError = true
          }
        }

        const [kpiResult, warningsResult] = await Promise.allSettled([
          fetchJson<HomeworkKpi>(`/api/homework/kpi?class_num=${classNum}`, controller.signal),
          fetchJson<HomeworkWarnings>(`/api/homework/warnings?class_num=${classNum}`, controller.signal),
        ])

        if (controller.signal.aborted || requestId !== requestIdRef.current) return

        setSnapshot({
          exams,
          statsById: Object.fromEntries(detailEntries),
          focusList,
          focusError,
          homeworkKpi: kpiResult.status === 'fulfilled' ? kpiResult.value : null,
          homeworkWarnings: warningsResult.status === 'fulfilled' ? warningsResult.value : null,
          homeworkError: kpiResult.status === 'rejected' || warningsResult.status === 'rejected',
        })
        setState('ready')
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setState('error')
      }
    }

    void loadDashboard()
    return () => controller.abort()
  }, [activeScope, reloadKey, scopeLoading])

  const exams = snapshot?.exams ?? []
  const latestExam = exams[0] ?? null
  const latestStats = latestExam ? snapshot?.statsById[latestExam.id] : undefined
  const secondaryType = activeScope?.grade === 1 ? '五门' : '3+3'
  const trendData = useMemo(
    () =>
      exams
        .slice(0, 8)
        .reverse()
        .map((exam) => ({
          name: exam.name.length > 8 ? `${exam.name.slice(0, 8)}…` : exam.name,
          average: snapshot?.statsById[exam.id]?.avg_main_total ?? null,
        }))
        .filter((item) => item.average != null),
    [exams, snapshot?.statsById]
  )

  const headerDescription = activeScope
    ? `${teacher?.name?.trim() || '班主任'} · ${activeScope.label}${latestExam ? ` · 最近考试 ${latestExam.name}` : ''}`
    : '集中查看成绩、作业和学生跟进状态'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Homeroom overview"
        title="仪表盘"
        description={headerDescription}
        actions={
          <Button asChild>
            <Link href="/upload" className="min-h-11">
              <Upload className="h-4 w-4" />
              上传新成绩
            </Link>
          </Button>
        }
      />

      {teacher?.has_pending_rollover && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-warning-500/30 bg-warning-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" />
            <div>
              <p className="text-sm font-extrabold text-foreground">检测到待处理的升级换届</p>
              <p className="mt-0.5 text-xs text-muted-foreground">确认学生跨学年身份后，历史趋势才能连续展示。</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href="/settings/rollover">前往处理</Link>
          </Button>
        </div>
      )}

      {scopeLoading || state === 'idle' ? (
        <DashboardSkeleton />
      ) : !activeScope ? (
        <StatePanel
          tone="first-use"
          title="请先绑定行政班"
          description="班主任版不会猜测默认班级。上传成绩并完成班级绑定后，仪表盘会显示对应年级和行政班的数据。"
          action={
            <Button asChild className="min-h-11">
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                上传并绑定班级
              </Link>
            </Button>
          }
        />
      ) : state === 'error' ? (
        <StatePanel
          tone="error"
          title="仪表盘数据加载失败"
          description="当前班级范围已保留，可以重试；系统不会以零值替代失败的数据。"
          action={
            <Button variant="outline" className="min-h-11" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              重新加载
            </Button>
          }
        />
      ) : state === 'loading' || !snapshot ? (
        <DashboardSkeleton />
      ) : (
        <>
          {snapshot.focusError && (
            <div
              className="mb-4 flex items-start gap-3 rounded-[10px] border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-800"
              role="status"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-extrabold">部分数据未能加载</p>
                <p className="mt-0.5 text-xs leading-relaxed">最近考试关注名单读取失败，相关人数暂以“—”显示；成绩与作业数据不受影响。</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="order-1 lg:order-3 lg:col-span-8">
            <WeeklyFocusCard />
          </section>

          <section className="order-2 space-y-4 lg:order-4 lg:col-span-4">
            <QuickActions />
            <RecentExam exam={latestExam} stats={latestStats} focusCount={snapshot.focusList.length} focusError={snapshot.focusError} />
          </section>

          <section className="order-3 lg:order-2 lg:col-span-12">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatCard label="本学年考试" value={exams.length} unit="场" icon={<CalendarDays className="h-4 w-4" />} href="/exam" />
              <StatCard label="主三门班均" value={formatNumber(latestStats?.avg_main_total)} icon={<ClipboardCheck className="h-4 w-4" />} helper={latestExam?.name || '暂无考试'} />
              <StatCard label={`${secondaryType}班均`} value={totalAverage(latestStats, secondaryType)} icon={<School className="h-4 w-4" />} helper={activeScope.label} />
              <StatCard label="年级名次范围" value={formatRankRange(latestStats)} icon={<FileSpreadsheet className="h-4 w-4" />} helper="最近一次考试" />
              <StatCard
                label="考试重点关注"
                value={snapshot.focusError ? '—' : snapshot.focusList.length}
                unit={snapshot.focusError ? undefined : '人'}
                icon={<Users className="h-4 w-4" />}
                tone={snapshot.focusError ? 'default' : snapshot.focusList.length ? 'warning' : 'success'}
                helper={snapshot.focusError ? '关注名单加载失败' : undefined}
                href={latestExam ? `/exam/${latestExam.id}` : '/exam'}
              />
              <StatCard label="作业预警学生" value={snapshot.homeworkWarnings?.counts.students ?? '—'} unit={snapshot.homeworkWarnings ? '人' : undefined} icon={<AlertCircle className="h-4 w-4" />} tone={(snapshot.homeworkWarnings?.counts.students ?? 0) ? 'danger' : 'default'} href="/homework/warnings" />
            </div>
          </section>

          <section className="order-4 lg:order-5 lg:col-span-8">
            <ChartPanel
              title="主三门班均趋势"
              description="仅展示当前年级中存在真实班均数据的考试"
              action={<Button asChild variant="ghost" size="sm" className="min-h-11"><Link href="/exam">全部考试</Link></Button>}
            >
              {trendData.length === 0 ? (
                <StatePanel
                  tone="empty"
                  title="暂无可绘制的考试趋势"
                  description="上传成绩后，这里会按考试时间展示主三门班均变化。"
                  className="min-h-64 border-0 bg-transparent py-6"
                  action={<Button asChild variant="outline" size="sm" className="min-h-11"><Link href="/upload">上传成绩</Link></Button>}
                />
              ) : (
                <>
                  <div
                    className="h-[280px] w-full"
                    role="img"
                    aria-label={`主三门班均趋势图，共 ${trendData.length} 个数据点；${trendData.map((item) => `${item.name} ${formatNumber(item.average)} 分`).join('，')}`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 12, right: 10, bottom: 8, left: -12 }}>
                        <CartesianGrid stroke="#ece7e0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#6b7580', fontSize: 11 }} axisLine={{ stroke: '#d9d2c7' }} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7580', fontSize: 11 }} axisLine={false} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                        <RechartsTooltip contentStyle={{ border: '1px solid #d9d2c7', borderRadius: 8, boxShadow: '0 8px 24px rgba(47,59,71,.12)', fontSize: 12 }} formatter={(value) => [formatNumber(Number(value)), '主三门班均']} />
                        <Line type="monotone" dataKey="average" stroke="#3b6ea5" strokeWidth={2.5} dot={{ r: 3, fill: '#ffffff', stroke: '#3b6ea5', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="sr-only">
                    {trendData.map((item, index) => (
                      <li key={`${item.name}-${index}`}>{item.name}：主三门班均 {formatNumber(item.average)} 分</li>
                    ))}
                  </ul>
                </>
              )}
            </ChartPanel>
          </section>

          <section className="order-5 lg:order-6 lg:col-span-4">
            <HomeworkSummary
              kpi={snapshot.homeworkKpi}
              warnings={snapshot.homeworkWarnings}
              error={snapshot.homeworkError}
            />
          </section>

          <section className="order-6 lg:order-7 lg:col-span-12">
            <BackupCard />
          </section>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-label="正在加载仪表盘">
      <Skeleton className="h-64 lg:col-span-8" />
      <Skeleton className="h-64 lg:col-span-4" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-28 lg:col-span-2" />
      ))}
      <Skeleton className="h-80 lg:col-span-8" />
      <Skeleton className="h-80 lg:col-span-4" />
    </div>
  )
}

function QuickActions() {
  const actions = [
    { href: '/upload', label: '上传成绩', icon: Upload },
    { href: '/homework', label: '快速录入', icon: ClipboardCheck },
    { href: '/student', label: '查找学生', icon: Search },
  ]

  return (
    <SectionCard title="快捷操作" description="从当前班级范围继续工作">
      <div className="grid grid-cols-3 gap-2">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-secondary/35 px-2 text-center text-xs font-bold text-foreground transition-colors hover:border-strong-border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon className="h-5 w-5 text-primary" />
            {label}
          </Link>
        ))}
      </div>
      <Button
        variant="outline"
        className="mt-2 min-h-11 w-full"
        onClick={() => window.dispatchEvent(new Event('open-chat'))}
      >
        <Bot className="h-4 w-4" />
        打开 AI 助手
      </Button>
    </SectionCard>
  )
}

function RecentExam({ exam, stats, focusCount, focusError }: { exam: Exam | null; stats?: ExamStats; focusCount: number; focusError: boolean }) {
  return (
    <SectionCard title="最近考试" description="当前年级最新建档记录">
      {!exam ? (
        <div className="flex min-h-24 flex-col items-start justify-center gap-2">
          <p className="text-sm font-bold text-foreground">暂无考试数据</p>
          <Button asChild variant="outline" size="sm" className="min-h-11"><Link href="/upload">上传第一场考试</Link></Button>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/exam/${exam.id}`} className="flex min-h-11 items-center text-sm font-extrabold text-foreground hover:text-primary hover:underline"><span className="line-clamp-2">{exam.name}</span></Link>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(exam.exam_date)}{exam.exam_type ? ` · ${exam.exam_type}` : ''}</p>
            </div>
            {focusError ? (
              <Badge variant="secondary">关注读取失败</Badge>
            ) : (
              <Badge variant={focusCount ? 'warning' : 'success'}>{focusCount} 人关注</Badge>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <div><p className="text-[11px] text-muted-foreground">主三门班均</p><p className="mt-1 text-lg font-extrabold tabular-nums">{formatNumber(stats?.avg_main_total)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">年级名次范围</p><p className="mt-1 text-lg font-extrabold tabular-nums">{formatRankRange(stats)}</p></div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function HomeworkSummary({ kpi, warnings, error }: { kpi: HomeworkKpi | null; warnings: HomeworkWarnings | null; error: boolean }) {
  const hasHomeworkData = Boolean(
    kpi && warnings && (
      kpi.total_misses > 0 ||
      warnings.counts.students > 0 ||
      warnings.counts.serious > 0 ||
      warnings.counts.warning > 0
    )
  )

  return (
    <SectionCard title="作业摘要" description="当前学期缺交与连续缺交预警" action={<Button asChild variant="ghost" size="sm" className="min-h-11"><Link href="/homework">进入看板</Link></Button>}>
      {error ? (
        <StatePanel tone="error" title="作业数据加载失败" description="成绩数据不受影响。" className="min-h-64 border-0 bg-transparent px-2 py-6" />
      ) : !hasHomeworkData ? (
        <StatePanel
          tone="empty"
          title="暂无作业缺交记录"
          description="当前班级在本学期范围内还没有有效缺交数据。录入后会在这里汇总连续缺交预警。"
          className="min-h-64 border-0 bg-transparent px-2 py-6"
          action={<Button asChild variant="outline" className="min-h-11"><Link href="/homework">录入作业情况</Link></Button>}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-secondary/35 p-3"><p className="text-xs text-muted-foreground">累计缺交</p><p className="mt-2 text-2xl font-extrabold text-danger-600 tabular-nums">{kpi?.total_misses ?? 0}<span className="ml-1 text-xs text-muted-foreground">次</span></p></div>
            <div className="rounded-lg border border-border bg-secondary/35 p-3"><p className="text-xs text-muted-foreground">预警学生</p><p className="mt-2 text-2xl font-extrabold text-warning-600 tabular-nums">{warnings?.counts.students ?? 0}<span className="ml-1 text-xs text-muted-foreground">人</span></p></div>
          </div>
          <div className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">连续缺交严重</span><span className="font-extrabold text-danger-600 tabular-nums">{warnings?.counts.serious ?? 0}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">连续缺交提醒</span><span className="font-extrabold text-warning-600 tabular-nums">{warnings?.counts.warning ?? 0}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">缺交最多种类</span><span className="truncate font-extrabold">{kpi?.worst_subject?.name || '暂无'}</span></div>
          </div>
          <Button asChild variant="outline" className="min-h-11 w-full"><Link href="/homework/warnings">查看连续缺交预警</Link></Button>
        </div>
      )}
    </SectionCard>
  )
}
