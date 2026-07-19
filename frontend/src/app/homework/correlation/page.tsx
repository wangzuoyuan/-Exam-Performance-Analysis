'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { HomeworkNav } from '@/components/homework/HomeworkNav'
import { FilterBar } from '@/components/patterns/FilterBar'
import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理']

interface Row {
  student_id: string
  name: string
  miss_count: number
  xueji_rank?: number | null
  grade_percentile?: number | null
}

interface Correlation {
  exam_id: number | null
  subject: string | null
  y_field: string
  y_label: string
  rows: Row[]
}

interface SubjectRank {
  subject: string
  r: number | null
  n: number
}

export default function CorrelationPage() {
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const [subject, setSubject] = useState('')
  const [data, setData] = useState<Correlation | null>(null)
  const [ranking, setRanking] = useState<SubjectRank[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!activeScope) {
      setData(null)
      setRanking([])
      setError(null)
      return
    }
    const controller = new AbortController()
    const classNum = activeScope.classNum
    setLoading(true)
    setData(null)
    setRanking([])
    setError(null)

    const query = `class_num=${classNum}${subject ? `&subject=${encodeURIComponent(subject)}` : ''}`
    void fetch(`/api/homework/correlation?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '相关性数据加载失败')
        }
        const correlation = await response.json() as Correlation
        if (subject) return { correlation, ranking: [] as SubjectRank[] }
        const rankingResponse = await fetch(`/api/homework/correlation/subjects?class_num=${classNum}`, { cache: 'no-store', signal: controller.signal })
        if (!rankingResponse.ok) {
          const body = await rankingResponse.json().catch(() => ({}))
          throw new Error(body.detail || '学科相关性排行加载失败')
        }
        const rankingResult = await rankingResponse.json() as { rankings?: SubjectRank[] }
        return { correlation, ranking: rankingResult.rankings || [] }
      })
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result.correlation)
        setRanking(result.ranking)
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '相关性数据加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [activeScope, reloadKey, subject])

  const yField: 'xueji_rank' | 'grade_percentile' = data?.y_field === 'grade_percentile' ? 'grade_percentile' : 'xueji_rank'
  const points = useMemo(
    () => (data?.rows || []).filter((row) => row[yField] != null).map((row) => ({ x: row.miss_count, y: row[yField] as number, name: row.name, studentId: row.student_id })),
    [data, yField]
  )
  const missThreshold = useMemo(() => {
    if (!points.length) return 0
    const values = points.map((point) => point.x).sort((left, right) => left - right)
    return values[Math.floor(values.length * 0.7)]
  }, [points])
  const scoreThreshold = useMemo(() => {
    if (!points.length) return 0
    const values = points.map((point) => point.y).sort((left, right) => left - right)
    return values[Math.floor(values.length * 0.6)]
  }, [points])
  const flagged = useMemo(() => points.filter((point) => point.x >= missThreshold && point.y >= scoreThreshold), [missThreshold, points, scoreThreshold])
  const flaggedNames = new Set(flagged.map((point) => point.name))
  const yLabel = data?.y_label || '学籍排名'
  const maxAbsR = Math.max(0.0001, ...ranking.map((item) => Math.abs(item.r || 0)))

  if (!scopeLoading && !activeScope) {
    return (
      <StatePanel
        tone="first-use"
        title="请先绑定并选择行政班"
        description="相关性分析必须在明确的行政班范围内进行，不会回退到固定班级。"
        action={<Button asChild className="min-h-11"><Link href="/upload">前往绑定班级</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label || '作业跟踪'}
        title="缺交 × 成绩"
        description="识别缺交偏多且成绩偏弱的学生；相关性只用于筛查，不表示因果。"
        actions={<Button asChild variant="outline" className="min-h-11"><Link href="/homework">返回看板</Link></Button>}
      />
      <HomeworkNav current="/homework/correlation" />

      <FilterBar aria-label="选择分析学科" className="flex-row items-center">
        <span className="w-full text-xs font-extrabold text-muted-foreground sm:w-auto">分析范围</span>
        <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {[{ value: '', label: '总览' }, ...SUBJECTS.map((item) => ({ value: item, label: item }))].map((item) => (
            <button
              key={item.value || 'overview'}
              type="button"
              onClick={() => setSubject(item.value)}
              aria-pressed={subject === item.value}
              className={cn(
                'min-h-11 shrink-0 rounded-md px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                subject === item.value ? 'bg-primary text-white' : 'border border-border bg-white text-muted-foreground hover:border-strong-border hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <SectionCard
        title={subject ? `${subject}缺交 × 该科成绩` : '缺交总数 × 学籍排名'}
        description="红点为缺交偏多且成绩偏弱的重点关注象限。"
      >
        {loading ? (
          <StatePanel tone="loading" title="正在计算相关性" className="py-8" />
        ) : error ? (
          <StatePanel
            tone="error"
            title="相关性加载失败"
            description={`${error}。不会显示伪造的零指标。`}
            action={<Button className="min-h-11" onClick={() => setReloadKey((value) => value + 1)}>重新加载</Button>}
          />
        ) : points.length === 0 ? (
          <StatePanel tone="empty" title="暂无可对照数据" description={subject ? `最近考试可能未包含${subject}成绩。` : '需要当前班级已有考试成绩和作业记录。'} />
        ) : (
          <div role="img" aria-label={`${subject || '总览'}缺交与${yLabel}散点图，共 ${points.length} 名学生`}>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 22, right: 18, bottom: 36, left: 4 }}>
                <CartesianGrid stroke="#ece7e0" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="缺交次数"
                  tick={{ fontSize: 11, fill: '#6b7580' }}
                  stroke="#d9d2c7"
                  label={{ value: '缺交次数 →', position: 'insideBottom', offset: -20, fontSize: 12, fill: '#6b7580' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yLabel}
                  reversed
                  domain={yField === 'grade_percentile' ? [0, 1] : ['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#6b7580' }}
                  stroke="#d9d2c7"
                  width={42}
                />
                <ZAxis range={[68, 68]} />
                <RechartsTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const point = payload?.[0]?.payload as { name: string; x: number; y: number } | undefined
                    if (!point) return null
                    return (
                      <div className="rounded-md border border-strong-border bg-white px-3 py-2 text-xs shadow-lg">
                        <div className="font-extrabold text-foreground">{point.name}</div>
                        <div className="mt-1 text-muted-foreground">缺交 {point.x} 次 · {yLabel} {yField === 'grade_percentile' ? `${Math.round(point.y * 100)}%` : point.y}</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={points}>
                  {points.map((point) => <Cell key={point.studentId || point.name} fill={flaggedNames.has(point.name) ? '#c0504f' : '#5a8fa8'} />)}
                  <LabelList
                    dataKey="name"
                    position="top"
                    content={(props) => {
                      const { x, y, value } = props as { x?: number; y?: number; value?: string }
                      if (x == null || y == null || !value) return null
                      const isFlagged = flaggedNames.has(value)
                      return <text x={x} y={y - 7} textAnchor="middle" fontSize={10} fill={isFlagged ? '#c0504f' : '#6b7580'} fontWeight={isFlagged ? 700 : 400}>{value}</text>
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <ul className="sr-only">
              {points.map((point) => <li key={point.studentId || point.name}>{point.name}：缺交 {point.x} 次，{yLabel} {point.y}</li>)}
            </ul>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {yField === 'grade_percentile' ? '年级百分位越小越靠前（图中越高）。' : '学籍排名越小越靠前（图中越高）。'} 作业数据只反映缺交，不代表完成质量。
            </p>
          </div>
        )}
      </SectionCard>

      {!loading && !error && !subject && ranking.length > 0 && (
        <SectionCard title="各科相关强弱" description="r 为皮尔逊相关系数；正值越大，缺交与成绩偏弱的共同变化越明显。">
          <div className="space-y-2.5">
            {ranking.map((item) => (
              <div key={item.subject} className="grid grid-cols-[3rem_1fr_7rem] items-center gap-3">
                <button type="button" onClick={() => setSubject(item.subject)} className="min-h-11 text-left text-sm font-extrabold text-primary hover:underline">{item.subject}</button>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  {item.r != null && item.r > 0 && <div className="h-full rounded-full bg-[#c98a4b]" style={{ width: `${(item.r / maxAbsR) * 100}%` }} />}
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">{item.r == null ? `样本不足 n=${item.n}` : `r=${item.r.toFixed(2)} · n=${item.n}`}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!loading && !error && flagged.length > 0 && (
        <SectionCard title={`重点关注 · ${flagged.length} 人`} description={`高缺交 + ${subject ? `${subject}偏弱` : '排名靠后'}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {flagged.sort((left, right) => right.x - left.x).map((point) => (
              <Link key={point.studentId || point.name} href={`/student/${point.studentId}`} className="flex min-h-14 items-center justify-between rounded-lg border border-danger-500/25 bg-danger-50 px-3 text-sm hover:border-danger-500/50">
                <span className="font-extrabold text-danger-700">{point.name}</span>
                <span className="text-xs text-danger-600">缺交 {point.x} 次 · {yField === 'grade_percentile' ? `${Math.round(point.y * 100)}%` : `排名 ${point.y}`}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
