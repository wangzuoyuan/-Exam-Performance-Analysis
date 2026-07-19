'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, BookOpenCheck, ClipboardList, RefreshCw, TrendingDown } from 'lucide-react'

import { HomeworkNav } from '@/components/homework/HomeworkNav'
import { SmartInputBox, type HomeworkSubmitFeedback } from '@/components/homework/SmartInputBox'
import { WarningList, type HomeworkWarningItem } from '@/components/homework/WarningList'
import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatCard } from '@/components/patterns/StatCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Button } from '@/components/ui/button'

const CHART_COLORS = ['#3b6ea5', '#c98a4b', '#3f8f6e', '#b5741f', '#7b6ca8', '#5a8fa8']

interface Kpi {
  total_misses: number
  worst_subject: { name: string; count: number }
  top_students: { name: string; count: number }[]
}

interface SubjectSlice {
  name: string
  value: number
  students: { name: string; count: number }[]
}

interface Warnings {
  serious: HomeworkWarningItem[]
  warning: HomeworkWarningItem[]
  counts: { serious: number; warning: number; students: number }
}

interface DashboardData {
  kpi: Kpi | null
  trend: { dates: string[]; counts: number[] } | null
  subjects: SubjectSlice[] | null
  rankings: { names: string[]; counts: number[] } | null
  warnings: Warnings | null
}

type DataKey = keyof DashboardData

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || '数据加载失败')
  }
  return response.json() as Promise<T>
}

export default function HomeworkPage() {
  const router = useRouter()
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const [data, setData] = useState<DashboardData>({
    kpi: null,
    trend: null,
    subjects: null,
    rankings: null,
    warnings: null,
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<DataKey, string>>>({})
  const [reloadKey, setReloadKey] = useState(0)

  const [raw, setRaw] = useState('')
  const [date, setDate] = useState(todayString())
  const [mode, setMode] = useState<'by_student' | 'by_subject'>('by_student')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<HomeworkSubmitFeedback | null>(null)

  useEffect(() => {
    if (!activeScope) {
      setData({ kpi: null, trend: null, subjects: null, rankings: null, warnings: null })
      setErrors({})
      return
    }

    const controller = new AbortController()
    const classNum = activeScope.classNum
    const query = `class_num=${classNum}`
    setLoading(true)
    setErrors({})

    const requests: Array<[DataKey, Promise<unknown>]> = [
      ['kpi', fetchJson<Kpi>(`/api/homework/kpi?${query}`, controller.signal)],
      ['trend', fetchJson<DashboardData['trend']>(`/api/homework/trend?${query}`, controller.signal)],
      ['subjects', fetchJson<SubjectSlice[]>(`/api/homework/subjects?${query}`, controller.signal)],
      ['rankings', fetchJson<DashboardData['rankings']>(`/api/homework/rankings?${query}&limit=10`, controller.signal)],
      ['warnings', fetchJson<Warnings>(`/api/homework/warnings?${query}`, controller.signal)],
    ]

    void Promise.allSettled(requests.map(([, request]) => request)).then((results) => {
      if (controller.signal.aborted) return
      const nextData: DashboardData = { kpi: null, trend: null, subjects: null, rankings: null, warnings: null }
      const nextErrors: Partial<Record<DataKey, string>> = {}
      results.forEach((result, index) => {
        const key = requests[index][0]
        if (result.status === 'fulfilled') {
          ;(nextData as Record<DataKey, unknown>)[key] = result.value
        } else {
          nextErrors[key] = result.reason instanceof Error ? result.reason.message : '数据加载失败'
        }
      })
      setData(nextData)
      setErrors(nextErrors)
      setLoading(false)
    })

    return () => controller.abort()
  }, [activeScope, reloadKey])

  const submit = useCallback(async () => {
    if (!raw.trim() || !activeScope) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const response = await fetch(`/api/homework/records?class_num=${activeScope.classNum}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: raw, date, mode }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) {
        throw new Error(result.detail || result.message || '录入失败')
      }
      const details = (result.errors || []) as string[]
      const added = Number(result.added_count || 0)
      setFeedback({
        tone: details.length > 0 ? 'partial' : 'success',
        title: details.length > 0 ? `已录入 ${added} 条，另有 ${details.length} 条未成功` : `已录入 ${added} 条记录`,
        details,
      })
      if (added > 0) setRaw('')
      setReloadKey((value) => value + 1)
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: error instanceof Error ? error.message : '录入失败，请稍后再试',
      })
    } finally {
      setSubmitting(false)
    }
  }, [activeScope, date, mode, raw])

  const trendData = useMemo(
    () =>
      (data.trend?.dates || []).map((item, index) => ({
        date: item.slice(5),
        fullDate: item,
        count: data.trend?.counts[index] || 0,
      })),
    [data.trend]
  )
  const rankData = useMemo(
    () => (data.rankings?.names || []).map((name, index) => ({ name, count: data.rankings?.counts[index] || 0 })),
    [data.rankings]
  )
  const warningItems = [...(data.warnings?.serious || []), ...(data.warnings?.warning || [])]
  const errorCount = Object.keys(errors).length
  const allFailed = errorCount === 5
  const hasHomeworkData = (data.kpi?.total_misses || 0) > 0

  const goManage = (params: Record<string, string>) => {
    router.push(`/homework/manage?${new URLSearchParams(params)}`)
  }

  if (!scopeLoading && !activeScope) {
    return (
      <StatePanel
        tone="first-use"
        title="请先绑定并选择行政班"
        description="作业录入、预警和成绩相关性必须在明确的班级范围内运行。"
        action={<Button asChild className="min-h-11"><Link href="/upload">前往绑定班级</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label || '作业跟踪'}
        title="作业跟踪"
        description="快速录入缺交与特殊情况，优先处理连续缺交学生。"
        actions={
          <Button variant="outline" className="min-h-11" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
        }
      />
      <HomeworkNav current="/homework" />

      {loading && !data.kpi ? (
        <StatePanel tone="loading" title="正在读取作业数据" description="正在同步当前班级的缺交、预警和统计。" />
      ) : allFailed ? (
        <StatePanel
          tone="error"
          title="作业数据加载失败"
          description="没有用零值替代失败数据，请检查服务后重试。"
          action={<Button className="min-h-11" onClick={() => setReloadKey((value) => value + 1)}>重新加载</Button>}
        />
      ) : (
        <>
          {errorCount > 0 && (
            <div role="alert" className="rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
              <strong>部分数据未能加载。</strong> 失败区域会显示“—”或独立错误状态，不会伪装为零。
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-12">
            <SectionCard
              title="快速录入"
              description="输入后先检查行结构，再由后端解析并逐条反馈。"
              className="order-1 lg:col-span-8"
              contentClassName="pt-0"
            >
              <SmartInputBox
                raw={raw}
                onRawChange={setRaw}
                date={date}
                onDateChange={setDate}
                mode={mode}
                onModeChange={setMode}
                submitting={submitting}
                feedback={feedback}
                onSubmit={() => void submit()}
              />
            </SectionCard>

            <SectionCard
              title="连续缺交"
              description="红色为连续 3 次及以上，黄色为连续 2 次。"
              className="order-2 lg:col-span-4"
              action={<Button asChild variant="outline" className="min-h-11"><Link href="/homework/warnings">查看全部</Link></Button>}
            >
              {errors.warnings ? (
                <StatePanel tone="error" title="预警加载失败" description={errors.warnings} className="py-6" />
              ) : warningItems.length > 0 ? (
                <WarningList items={warningItems.slice(0, 6)} compact />
              ) : (
                <StatePanel tone="empty" title="暂无连续缺交" description="当前班级没有达到连续缺交阈值的学生。" className="py-6" />
              )}
            </SectionCard>

            <div className="order-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-12">
              <StatCard
                label="本学期缺交"
                value={errors.kpi ? '—' : data.kpi?.total_misses ?? '—'}
                unit="人次"
                helper={errors.kpi ? '加载失败' : '请假不计缺交'}
                icon={<ClipboardList className="h-4 w-4" />}
                href="/homework/manage"
                tone="primary"
              />
              <StatCard
                label="缺交最多种类"
                value={errors.kpi ? '—' : data.kpi?.worst_subject.name || '—'}
                helper={errors.kpi ? '加载失败' : data.kpi?.worst_subject.count ? `${data.kpi.worst_subject.count} 次` : '暂无缺交'}
                icon={<TrendingDown className="h-4 w-4" />}
                tone="accent"
              />
              <StatCard
                label="预警学生"
                value={errors.warnings ? '—' : data.warnings?.counts.students ?? '—'}
                unit="人"
                helper={errors.warnings ? '加载失败' : `严重 ${data.warnings?.counts.serious ?? 0} · 提醒 ${data.warnings?.counts.warning ?? 0}`}
                icon={<AlertTriangle className="h-4 w-4" />}
                href="/homework/warnings"
                tone="danger"
                className="col-span-2 sm:col-span-1"
              />
            </div>

            {!hasHomeworkData && !errors.kpi && (
              <div className="order-4 lg:col-span-12">
                <StatePanel
                  tone="empty"
                  title="暂无作业缺交记录"
                  description="可在上方录入第一条记录；请假等特殊情况会保留，但不计入缺交统计。"
                />
              </div>
            )}

            <SectionCard title="每日缺交趋势" description="点击日期进入对应记录明细。" className="order-5 lg:col-span-7">
              {errors.trend ? (
                <StatePanel tone="error" title="趋势加载失败" description={errors.trend} className="py-6" />
              ) : trendData.length ? (
                <div>
                  <div role="img" aria-label={`每日缺交趋势，共 ${trendData.length} 个日期`}>
                    <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={trendData}
                      margin={{ top: 10, right: 14, bottom: 8, left: -12 }}
                      onClick={(state) => {
                        const point = state?.activePayload?.[0]?.payload as { fullDate?: string } | undefined
                        if (point?.fullDate) goManage({ date: point.fullDate })
                      }}
                    >
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7580' }} stroke="#ece7e0" />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7580' }} stroke="#ece7e0" allowDecimals={false} />
                      <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d9d2c7' }} />
                      <Line type="monotone" dataKey="count" name="缺交人次" stroke="#3b6ea5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="按日期查看缺交记录">
                    {trendData.map((item) => (
                      <Button
                        key={item.fullDate}
                        type="button"
                        variant="outline"
                        className="min-h-11 px-3 text-xs"
                        onClick={() => goManage({ date: item.fullDate })}
                      >
                        {item.date} · {item.count}人次
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <StatePanel tone="empty" title="暂无趋势数据" className="py-6" />
              )}
            </SectionCard>

            <SectionCard title="作业种类分布" description="点击扇区筛选该作业种类。" className="order-6 lg:col-span-5">
              {errors.subjects ? (
                <StatePanel tone="error" title="分布加载失败" description={errors.subjects} className="py-6" />
              ) : data.subjects?.length ? (
                <div>
                  <div role="img" aria-label="各作业种类缺交占比">
                    <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={data.subjects}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={92}
                        paddingAngle={2}
                        onClick={(item: { name?: string }) => item.name && goManage({ subject: item.name })}
                      >
                        {data.subjects.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d9d2c7' }} />
                    </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="按作业种类查看缺交记录">
                    {data.subjects.map((item) => (
                      <Button
                        key={item.name}
                        type="button"
                        variant="outline"
                        className="min-h-11 px-3 text-xs"
                        onClick={() => goManage({ subject: item.name })}
                      >
                        {item.name} · {item.value}人次
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <StatePanel tone="empty" title="暂无种类分布" className="py-6" />
              )}
            </SectionCard>

            <SectionCard title="缺交排行榜" description="点击学生可查看其记录。" className="order-7 lg:col-span-12">
              {errors.rankings ? (
                <StatePanel tone="error" title="排行加载失败" description={errors.rankings} className="py-6" />
              ) : rankData.length ? (
                <div>
                  <div role="img" aria-label="学生缺交次数排行榜">
                    <ResponsiveContainer width="100%" height={Math.max(240, rankData.length * 34)}>
                    <BarChart data={rankData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7580' }} stroke="#ece7e0" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#2f3b47' }} stroke="#ece7e0" width={66} />
                      <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d9d2c7' }} />
                      <Bar dataKey="count" name="缺交次数" fill="#c98a4b" radius={[0, 4, 4, 0]} onClick={(item: { name?: string }) => item.name && goManage({ student: item.name })} />
                    </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="按学生查看缺交记录">
                    {rankData.map((item) => (
                      <Button
                        key={item.name}
                        type="button"
                        variant="outline"
                        className="min-h-11 px-3 text-xs"
                        onClick={() => goManage({ student: item.name })}
                      >
                        {item.name} · {item.count}次
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <StatePanel tone="empty" title="暂无排行数据" className="py-6" />
              )}
            </SectionCard>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-xs text-muted-foreground">
        <BookOpenCheck className="h-4 w-4 shrink-0 text-success-600" />
        统计继续遵循请假不计缺交、全科排除和花名册排除规则。
      </div>
    </div>
  )
}
