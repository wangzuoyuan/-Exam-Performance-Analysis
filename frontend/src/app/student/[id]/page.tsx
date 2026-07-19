'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis as RXAxis,
  YAxis as RYAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  ChevronLeft,
  Hash,
  Info,
  Minus,
  TrendingUp,
} from 'lucide-react'

import TrendLineChart from '@/components/TrendLineChart'
import HomeworkCard from '@/components/HomeworkCard'
import StudentNotes from '@/components/StudentNotes'
import { cn } from '@/lib/utils'
import { formatStageHistory, type StageAlias } from '@/lib/labels'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatePanel } from '@/components/patterns/StatePanel'
import { StatCard } from '@/components/patterns/StatCard'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'

interface MainTrendPoint {
  exam_id: number
  exam_name: string
  grade?: number | null
  total_score?: number | null
  xueji_rank?: number | null
  grade_percentile?: number | null
  class_rank?: number | null
  total_full?: number | null
  exam_date?: string | null
  imported?: boolean
}

interface SubjectTrendPoint {
  exam_id: number
  exam_name: string
  exam_date?: string | null
  subject: string
  raw_score?: number | null
  grade_percentile?: number | null
  class_avg?: number | null
  imported?: boolean
  grade?: number | null
}

interface StageIdentity {
  id: number | null
  aliases: { student_id: string; grade: number; class_num: number | null }[]
}

interface StudentProfile {
  student_id: string
  name: string
  has_cross_year?: boolean
  grades?: number[]
  class_num?: number | null
  xueji_code?: number | null
  main_total_trend: MainTrendPoint[]
  subject_trend: SubjectTrendPoint[]
  five_trend?: MainTrendPoint[]
  plus3_trend?: MainTrendPoint[]
  san3_trend?: MainTrendPoint[]
  identity?: StageIdentity
  /** 注意：键是字符串（如 "1"），使用时需 parse 为 number */
  class_by_grade?: Record<string, number>
}

interface StudentScopeSummary {
  student_id: string
  current_grade?: number | null
  class_num?: number | null
}

type TotalTypeKey = '主三门' | '五门' | '+3' | '3+3'

const ALL_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理']
const SIGNIFICANT_PCT = 0.1

const DASH = '—'

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return null
}

function hasSubjectScore(point: SubjectTrendPoint): boolean {
  return safeNum(point.raw_score) !== null
}

// 取 main_total_trend 中最后一场考试的 grade（用于新学生判定，独立于渲染期的 latestGrade）。
function latestGradePreCheck(profile: StudentProfile): number {
  const trend = profile.main_total_trend || []
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].grade != null) return trend[i].grade as number
  }
  return 2
}

function formatPercent(v: number | null | undefined): string {
  const n = safeNum(v)
  if (n === null) return DASH
  return `${Math.round(n * 100)}%`
}

function nameInitial(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0)
}

function xuejiBadge(code: number | null | undefined) {
  if (code === 1) {
    return {
      label: '学籍：闵中',
      className: 'border-transparent bg-brand-50 text-brand-700',
      withCaveat: true,
    }
  }
  if (code === 3) {
    return {
      label: '学籍：文绮',
      className: 'border-transparent bg-slate-100 text-slate-700',
      withCaveat: false,
    }
  }
  if (code === 4) {
    return {
      label: '学籍：外省市/复学',
      className: 'border-transparent bg-warning-50 text-warning-700',
      withCaveat: false,
    }
  }
  return null
}

function DeltaArrow({
  current,
  previous,
  invert = false,
  threshold = 0,
}: {
  current: number | null
  previous: number | null
  /** invert=true 表示"数值越小越好"（如排名、百分位） */
  invert?: boolean
  threshold?: number
}) {
  if (current === null || previous === null) {
    return <span className="text-slate-400">{DASH}</span>
  }
  const diff = current - previous
  const absDiff = Math.abs(diff)
  if (absDiff <= threshold) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Minus className="h-3.5 w-3.5" />
        持平
      </span>
    )
  }
  // 进步条件：invert 时 diff < 0（变小），非 invert 时 diff > 0
  const improved = invert ? diff < 0 : diff > 0
  const Icon = improved ? ArrowUpRight : ArrowDownRight
  const cls = improved ? 'text-success-500' : 'text-danger-500'
  const display = invert
    ? `${diff > 0 ? '+' : ''}${diff}`
    : `${diff > 0 ? '+' : ''}${diff}`
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', cls)}>
      <Icon className="h-3.5 w-3.5" />
      {display}
    </span>
  )
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function SubjectSparkCard({
  subject,
  points,
}: {
  subject: string
  points: SubjectTrendPoint[]
}) {
  const sorted = points
  const latest = sorted[sorted.length - 1]
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null

  const latestPct = safeNum(latest?.grade_percentile)
  const prevPct = safeNum(prev?.grade_percentile)
  const latestScore = safeNum(latest?.raw_score)
  const latestAvg = safeNum(latest?.class_avg)

  const hasAnyPct = sorted.some((p) => safeNum(p.grade_percentile) !== null)

  // 趋势箭头：百分位越小越好
  let trendNode: React.ReactNode = <span className="text-slate-400">{DASH}</span>
  if (latestPct !== null && prevPct !== null) {
    const diff = latestPct - prevPct
    if (Math.abs(diff) < SIGNIFICANT_PCT) {
      trendNode = (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <Minus className="h-3.5 w-3.5" />
          持平
        </span>
      )
    } else if (diff < 0) {
      trendNode = (
        <span className="inline-flex items-center gap-1 font-medium text-success-500">
          <ArrowUpRight className="h-3.5 w-3.5" />
          进步
        </span>
      )
    } else {
      trendNode = (
        <span className="inline-flex items-center gap-1 font-medium text-danger-500">
          <ArrowDownRight className="h-3.5 w-3.5" />
          退步
        </span>
      )
    }
  }

  const sparkData = sorted.map((p) => ({
    name: p.exam_name,
    pct: hasAnyPct ? safeNum(p.grade_percentile) : safeNum(p.raw_score),
  }))
  const hasSparkData = sparkData.some((d) => d.pct !== null)

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-slate-900">{subject}</span>
            <span className="text-sm text-slate-500">
              {hasAnyPct ? formatPercent(latestPct) : DASH}
            </span>
          </div>
          {trendNode}
        </div>

        <div
          className="h-12 w-full"
          role={hasSparkData ? 'img' : undefined}
          aria-label={hasSparkData ? `${subject}${hasAnyPct ? '年级百分位' : '原始分'}趋势图，共${sparkData.length}场考试` : undefined}
        >
          {hasSparkData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <RXAxis dataKey="name" hide />
                <RYAxis hide reversed={hasAnyPct} />
                <RTooltip
                  cursor={false}
                  contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                  formatter={(v: number | string) =>
                    typeof v === 'number' && hasAnyPct ? `${Math.round(v * 100)}%` : v
                  }
                  labelFormatter={(label) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  name={hasAnyPct ? '年级百分位' : '原始分'}
                  stroke="#3b6ea5"
                  strokeWidth={1.75}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              暂无数据
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500">
          {latestScore !== null ? `最新 ${latestScore} 分` : `最新 ${DASH}`}
          {latestAvg !== null && ` / 班均 ${latestAvg} 分`}
        </div>

        {!hasAnyPct && (
          <div className="text-xs text-slate-400">百分位数据缺失</div>
        )}
      </CardContent>
    </Card>
  )
}

function StudentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-20" />
      <Card>
        <CardContent className="flex items-center gap-4 py-6">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-7 w-24" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function StudentPage() {
  const params = useParams<{ id: string }>()
  const studentId = Array.isArray(params?.id) ? params?.id[0] : params?.id
  const { activeScope, loading: scopeLoading, error: scopeError } = useHomeroomScope()

  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [linkSid, setLinkSid] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkMsg, setLinkMsg] = useState<string | null>(null)

  useEffect(() => {
    if (scopeLoading) return
    if (!studentId || !activeScope) {
      setProfile(null)
      setLoading(false)
      setError(scopeError || '请先绑定并选择行政班')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    async function loadAuthorizedProfile() {
      try {
        const listResponse = await fetch('/api/students', { cache: 'no-store', signal: controller.signal })
        if (!listResponse.ok) throw new Error('无法验证学生所属班级')
        const students = (await listResponse.json()) as StudentScopeSummary[]
        const authorized = students.some(
          (student) =>
            student.student_id === studentId &&
            student.current_grade === activeScope!.grade &&
            student.class_num === activeScope!.classNum
        )
        if (!authorized) throw new Error('该学生不属于当前班级，无法查看学生画像')

        const profileResponse = await fetch(`/api/students/${studentId}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!profileResponse.ok) throw new Error('无法读取学生画像')
        setProfile((await profileResponse.json()) as StudentProfile)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setProfile(null)
        setError(cause instanceof Error ? cause.message : '学生画像加载失败')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadAuthorizedProfile()
    return () => controller.abort()
  }, [activeScope, scopeError, scopeLoading, studentId])

  // 趋势按考试时间（exam_date，格式 YYYY-MM）升序；exam_id 仅作并列兜底。
  // 注意：不能按 exam_id 排序——上传顺序≠考试时间顺序。
  const compareByExamDate = (
    a: { exam_id: number; exam_date?: string | null },
    b: { exam_id: number; exam_date?: string | null }
  ) => {
    const da = a.exam_date ?? ''
    const db = b.exam_date ?? ''
    if (da !== db) return da < db ? -1 : 1
    return a.exam_id - b.exam_id
  }

  // 主三门趋势按考试时间升序（最早 → 最新）；表格倒序展示
  const mainTrend = useMemo<MainTrendPoint[]>(() => {
    if (!profile?.main_total_trend) return []
    return [...profile.main_total_trend].sort(compareByExamDate)
  }, [profile])

  const fiveTrend = useMemo<MainTrendPoint[]>(() => {
    if (!profile?.five_trend) return []
    return [...profile.five_trend].sort(compareByExamDate)
  }, [profile])

  const plus3Trend = useMemo<MainTrendPoint[]>(() => {
    if (!profile?.plus3_trend) return []
    return [...profile.plus3_trend].sort(compareByExamDate)
  }, [profile])

  const san3Trend = useMemo<MainTrendPoint[]>(() => {
    if (!profile?.san3_trend) return []
    return [...profile.san3_trend].sort(compareByExamDate)
  }, [profile])

  const totalColumnSpecs = useMemo(() => {
    const grades = profile?.grades || []
    const hasGradeOne = grades.includes(1)
    const hasUpperGrade = grades.some((grade) => grade === 2 || grade === 3)
    const specs: {
      type: TotalTypeKey
      scoreLabel: string
      rankLabel?: string
    }[] = []

    if (hasGradeOne || !hasUpperGrade) {
      specs.push(
        { type: '主三门', scoreLabel: '三门总分', rankLabel: '三门排名' },
        { type: '五门', scoreLabel: '五门总分', rankLabel: '五门排名' }
      )
    }
    if (hasUpperGrade) {
      if (!specs.some((spec) => spec.type === '主三门')) {
        specs.push({ type: '主三门', scoreLabel: '三门总分', rankLabel: '三门排名' })
      }
      specs.push(
        { type: '+3', scoreLabel: '+3总分' },
        { type: '3+3', scoreLabel: '3+3六门总分', rankLabel: '3+3排名' }
      )
    }

    return specs
  }, [profile])

  // 按科目分桶
  const subjectBuckets = useMemo<Record<string, SubjectTrendPoint[]>>(() => {
    const map: Record<string, SubjectTrendPoint[]> = {}
    if (!profile?.subject_trend) return map
    for (const s of profile.subject_trend) {
      if (!hasSubjectScore(s)) continue
      if (!map[s.subject]) map[s.subject] = []
      map[s.subject].push(s)
    }
    Object.keys(map).forEach((k) => {
      map[k].sort(compareByExamDate)
    })
    return map
  }, [profile])

  // 历次考试明细：按 exam_id 倒序
  const examRows = useMemo(() => {
    if (!profile) return []
    // 收集所有 exam_id（来自 main + subject）
    const examMap = new Map<
      number,
      {
        exam_id: number
        exam_name: string
        exam_date?: string | null
        subjects: Record<string, number | null>
        totals: Record<string, { score: number | null; rank: number | null }>
        total: number | null
        class_rank: number | null
        xueji_rank: number | null
      }
    >()

    const ensureExam = (p: MainTrendPoint) => {
      let entry = examMap.get(p.exam_id)
      if (!entry) {
        entry = {
          exam_id: p.exam_id,
          exam_name: p.exam_name,
          exam_date: p.exam_date ?? null,
          subjects: {},
          totals: {},
          total: null,
          class_rank: null,
          xueji_rank: null,
        }
        examMap.set(p.exam_id, entry)
      }
      return entry
    }

    const addTotal = (type: TotalTypeKey, p: MainTrendPoint) => {
      const entry = ensureExam(p)
      const score = safeNum(p.total_score)
      const rank = safeNum(p.xueji_rank)
      entry.totals[type] = { score, rank }
      if (type === '主三门') {
        entry.total = score
        entry.class_rank = safeNum(p.class_rank)
        entry.xueji_rank = rank
      }
    }

    for (const p of profile.main_total_trend || []) addTotal('主三门', p)
    for (const p of profile.five_trend || []) addTotal('五门', p)
    for (const p of profile.plus3_trend || []) addTotal('+3', p)
    for (const p of profile.san3_trend || []) addTotal('3+3', p)

    for (const s of profile.subject_trend || []) {
      let entry = examMap.get(s.exam_id)
      if (!entry) {
        entry = {
          exam_id: s.exam_id,
          exam_name: s.exam_name,
          exam_date: s.exam_date ?? null,
          subjects: {},
          totals: {},
          total: null,
          class_rank: null,
          xueji_rank: null,
        }
        examMap.set(s.exam_id, entry)
      }
      entry.subjects[s.subject] = safeNum(s.raw_score)
    }

    return Array.from(examMap.values()).sort((a, b) => compareByExamDate(b, a))
  }, [profile])

  // KPI 计算（取最新两次主三门点）
  const kpi = useMemo(() => {
    const last = mainTrend[mainTrend.length - 1] || null
    const prev = mainTrend.length >= 2 ? mainTrend[mainTrend.length - 2] : null
    return {
      classRankNow: safeNum(last?.class_rank),
      classRankPrev: safeNum(prev?.class_rank),
      xuejiRankNow: safeNum(last?.xueji_rank),
      xuejiRankPrev: safeNum(prev?.xueji_rank),
      totalNow: safeNum(last?.total_score),
      totalFull: safeNum(last?.total_full),
    }
  }, [mainTrend])

  // 主三门趋势学段背景带：按 grade 字段切分连续考试区间。
  // grade=1 → 高一（brand-50），grade=2/3 → 高二及以上（slate-100）。
  const mainReferenceAreas = useMemo(() => {
    if (mainTrend.length === 0) return []
    type Band = { grade: number | null; x1: string; x2: string }
    const bands: Band[] = []
    for (const p of mainTrend) {
      const g = p.grade ?? null
      const last = bands[bands.length - 1]
      if (last && last.grade === g) {
        last.x2 = p.exam_name
      } else {
        bands.push({ grade: g, x1: p.exam_name, x2: p.exam_name })
      }
    }
    const fillFor = (g: number | null) => {
      if (g === 1) return '#eff6ff' // brand-50
      return '#f1f5f9' // slate-100
    }
    return bands.map((b) => ({ x1: b.x1, x2: b.x2, fill: fillFor(b.grade) }))
  }, [mainTrend])

  const hasImportedPoint = useMemo(
    () => mainTrend.some((p) => p.imported === true),
    [mainTrend],
  )

  // 新学生判定：identity 仅有当前学段（aliases <= 1）且无更低年级趋势数据。
  const isNewStudent = useMemo(() => {
    if (!profile?.identity) return false
    const aliases = profile.identity.aliases || []
    if (aliases.length > 1) return false
    const currentGrade =
      aliases.length === 1 ? aliases[0].grade : latestGradePreCheck(profile)
    const hasLowerGradeData = mainTrend.some(
      (p) => p.grade != null && p.grade < currentGrade,
    )
    return !hasLowerGradeData
  }, [profile, mainTrend])

  // 同步按钮的 busy/msg：打开对话框时清空上次状态
  useEffect(() => {
    if (importOpen) {
      setImportText('')
      setImportMsg(null)
    }
  }, [importOpen])
  useEffect(() => {
    if (linkOpen) {
      setLinkSid('')
      setLinkMsg(null)
    }
  }, [linkOpen])

  function reloadProfile() {
    if (!studentId) return
    fetch(`/api/students/${studentId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: StudentProfile) => setProfile(data))
      .catch(() => {
        /* 忽略重载错误，用户可手动刷新 */
      })
  }

  // 导入高一成绩：每行「考试名,科目,原始分[,等级分][,年级百分位][,学籍排名]」
  async function submitImportHistory() {
    if (!studentId || !profile) return
    const rows: Record<string, unknown>[] = []
    for (const raw of importText.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split(/[,\t，\s]+/).map((s) => s.trim()).filter(Boolean)
      if (parts.length < 2) continue
      const [exam_label, subject, raw_score, grade_score, grade_percentile, xueji_rank] = parts
      rows.push({
        exam_label,
        kind: 'subject',
        subject,
        raw_score: raw_score != null && raw_score !== '' ? Number(raw_score) : null,
        grade_score: grade_score != null && grade_score !== '' ? Number(grade_score) : null,
        grade_percentile:
          grade_percentile != null && grade_percentile !== '' ? Number(grade_percentile) : null,
        xueji_rank: xueji_rank != null && xueji_rank !== '' ? Number(xueji_rank) : null,
        grade: 1,
      })
    }
    if (rows.length === 0) {
      setImportMsg('请先粘贴成绩行')
      return
    }
    setImportBusy(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/rollover/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, name: profile.name, rows }),
      })
      if (res.ok) {
        const data = await res.json()
        setImportMsg(`已导入 ${data?.imported ?? rows.length} 条高一成绩`)
        reloadProfile()
      } else {
        setImportMsg('导入失败，请重试')
      }
    } catch {
      setImportMsg('导入失败，请重试')
    } finally {
      setImportBusy(false)
    }
  }

  // 关联高一学号
  async function submitLink() {
    if (!studentId || !profile) return
    const g1 = linkSid.trim()
    if (!g1) return
    setLinkBusy(true)
    setLinkMsg(null)
    try {
      const res = await fetch('/api/rollover/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          g2_student_id: studentId,
          g1_student_id: g1,
          name: profile.name,
        }),
      })
      if (res.ok) {
        setLinkMsg('已关联，正在刷新…')
        reloadProfile()
        setLinkOpen(false)
      } else {
        setLinkMsg('关联失败，请确认高一学号是否存在')
      }
    } catch {
      setLinkMsg('关联失败，请重试')
    } finally {
      setLinkBusy(false)
    }
  }

  if (scopeLoading || loading) {
    return <StudentDetailSkeleton />
  }

  if (error || !profile) {
    return (
      <StatePanel
        tone="error"
        title="学生画像加载失败"
        description={error || '请稍后重试，或确认该学号是否存在。'}
        action={<Button asChild variant="outline" className="min-h-11"><Link href="/student"><ChevronLeft className="h-4 w-4" />返回学生名单</Link></Button>}
      />
    )
  }

  const xueji = xuejiBadge(profile.xueji_code ?? null)
  const classNum = profile.class_num ?? null
  // 取最新一场考试的 grade 作为展示年级
  const latestGrade =
    mainTrend.length > 0 ? mainTrend[mainTrend.length - 1].grade ?? null : null

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Student profile"
          title={profile.name || DASH}
          description={`学号 ${profile.student_id || DASH} · ${classNum !== null ? `${classNum}班` : DASH} · ${latestGrade ? `高${latestGrade}` : DASH}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11"><Link href="/student"><ChevronLeft className="h-4 w-4" />学生名单</Link></Button>
              {studentId && <Button asChild className="min-h-11"><Link href={`/student/${studentId}/report`}>导出家长会一页纸</Link></Button>}
            </div>
          }
        />

        {/* 学生卡 */}
        <Card>
          <CardContent className="flex flex-col gap-4 py-6 md:flex-row md:items-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-brand-50 text-lg font-semibold text-brand-700">
                {nameInitial(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-base font-extrabold text-foreground">身份与学段履历</div>
              {profile.identity && (
                <p className="mt-0.5 text-xs text-slate-400">
                  学段履历：{formatStageHistory(profile.identity.aliases as StageAlias[])}
                </p>
              )}
            </div>
            {isNewStudent && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  导入高一成绩
                </button>
                <button
                  type="button"
                  onClick={() => setLinkOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  关联高一学号
                </button>
              </div>
            )}
            {xueji && (
              <div className="flex items-center gap-2">
                <Badge className={xueji.className}>{xueji.label}</Badge>
                {xueji.withCaveat && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="学籍说明"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      闵中学籍为估算口径，存在偏差
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 行 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="最新主三门班排" value={<span className="flex items-baseline gap-2">{kpi.classRankNow ?? DASH}<span className="text-xs"><DeltaArrow current={kpi.classRankNow} previous={kpi.classRankPrev} invert /></span></span>} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="最新学籍年级排名" value={<span className="flex items-baseline gap-2">{kpi.xuejiRankNow ?? DASH}<span className="text-xs"><DeltaArrow current={kpi.xuejiRankNow} previous={kpi.xuejiRankPrev} invert /></span></span>} icon={<Hash className="h-4 w-4" />} />
          <StatCard label="最新总分" value={kpi.totalNow ?? DASH} helper={kpi.totalFull !== null ? `满分 ${kpi.totalFull}` : undefined} icon={<Award className="h-4 w-4" />} className="col-span-2 md:col-span-1" />
        </div>

        {/* 作业缺交（仅作业花名册内学生显示） */}
        {studentId && <HomeworkCard studentId={studentId} />}

        {/* 成长 / 谈话档案 */}
        {studentId && (
          <div className="[&_button]:min-h-11">
            <StudentNotes studentId={studentId} />
          </div>
        )}

        {/* 主三门趋势图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">主三门总分 + 学籍年级排名趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {mainTrend.length > 0 ? (
              <>
                <TrendLineChart
                  data={mainTrend.map((p) => ({
                    exam_name: p.exam_name,
                    rank: safeNum(p.xueji_rank) ?? undefined,
                    score: safeNum(p.total_score) ?? undefined,
                    imported: p.imported === true,
                  }))}
                  yDataKey="rank"
                  color="#3b6ea5"
                  invertY
                  referenceAreas={mainReferenceAreas}
                  importedKey="imported"
                />
                <p className="mt-2 text-xs text-slate-400">
                  学籍排名越小越好，线越高代表排名越好
                </p>
                {hasImportedPoint && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full border border-slate-400 bg-slate-300/40" />
                    导入·不计年级排名（淡化空心点）
                  </p>
                )}
              </>
            ) : (
              <EmptyState title="趋势图数据待补" hint="尚无主三门考试记录" />
            )}
          </CardContent>
        </Card>

        {/* 五门趋势（高一） */}
        {fiveTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">五门总分 + 学籍年级排名趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                data={fiveTrend.map((p) => ({
                  exam_name: p.exam_name,
                  rank: safeNum(p.xueji_rank) ?? undefined,
                  score: safeNum(p.total_score) ?? undefined,
                }))}
                yDataKey="rank"
                color="#3f8f6e"
                invertY
              />
              <p className="mt-2 text-xs text-slate-400">
                五门 = 语文、数学、英语、物理、化学；排名越小越好
              </p>
            </CardContent>
          </Card>
        )}

        {/* +3 总分趋势（高二/高三） */}
        {plus3Trend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">+3 总分变化趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                data={plus3Trend.map((p) => ({
                  exam_name: p.exam_name,
                  score: safeNum(p.total_score) ?? undefined,
                }))}
                yDataKey="score"
                color="#7b6ca8"
              />
              <p className="mt-2 text-xs text-slate-400">
                +3 = 语数英 + 三门选考科目总分，分数越高线越高
              </p>
            </CardContent>
          </Card>
        )}

        {/* 3+3 学籍年级排名趋势（高二/高三） */}
        {san3Trend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3+3 六门总分 + 学籍年级排名趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                data={san3Trend.map((p) => ({
                  exam_name: p.exam_name,
                  rank: safeNum(p.xueji_rank) ?? undefined,
                }))}
                yDataKey="rank"
                color="#5a8fa8"
                invertY
              />
              <p className="mt-2 text-xs text-slate-400">
                学籍排名越小越好，线越高代表排名越好
              </p>
            </CardContent>
          </Card>
        )}

        {/* 单科细分 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ALL_SUBJECTS.map((sub) => {
            const points = subjectBuckets[sub] || []
            return <SubjectSparkCard key={sub} subject={sub} points={points} />
          })}
        </div>

        {/* 历次成绩表 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">历次考试明细</CardTitle>
          </CardHeader>
          <CardContent>
            {examRows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>考试</TableHead>
                      <TableHead>日期</TableHead>
                      {ALL_SUBJECTS.map((s) => (
                        <TableHead key={s} className="text-right">
                          {s.charAt(0)}
                        </TableHead>
                      ))}
                      {totalColumnSpecs.map((spec) => (
                        <TableHead key={`${spec.type}-score`} className="text-right">
                          {spec.scoreLabel}
                        </TableHead>
                      ))}
                      {totalColumnSpecs.map((spec) => (
                        spec.rankLabel ? (
                          <TableHead key={`${spec.type}-rank`} className="text-right">
                            {spec.rankLabel}
                          </TableHead>
                        ) : null
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examRows.map((row) => (
                      <TableRow key={row.exam_id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{row.exam_name}</TableCell>
                        <TableCell className="text-slate-500">
                          {row.exam_date || DASH}
                        </TableCell>
                        {ALL_SUBJECTS.map((s) => {
                          const v = row.subjects[s]
                          const missing = v === null || v === undefined
                          return (
                            <TableCell
                              key={s}
                              className={cn(
                                'text-right tabular-nums',
                                missing && 'bg-slate-50 text-slate-400'
                              )}
                            >
                              {missing ? DASH : v}
                            </TableCell>
                          )
                        })}
                        {totalColumnSpecs.map((spec) => {
                          const total = row.totals[spec.type]
                          const value = total?.score
                          return (
                            <TableCell key={`${spec.type}-score`} className="text-right tabular-nums font-medium">
                              {value !== null && value !== undefined ? value : DASH}
                            </TableCell>
                          )
                        })}
                        {totalColumnSpecs.map((spec) => {
                          if (!spec.rankLabel) return null
                          const total = row.totals[spec.type]
                          const value = total?.rank
                          return (
                            <TableCell key={`${spec.type}-rank`} className="text-right tabular-nums">
                              {value !== null && value !== undefined ? value : DASH}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState title="暂无考试记录" />
            )}
          </CardContent>
        </Card>

        {/* 导入高一成绩（新学生） */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-2xl max-sm:h-screen max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
            <DialogHeader>
              <DialogTitle>导入高一成绩 · {profile.name || DASH}</DialogTitle>
              <DialogDescription>
                把该生的高一历史成绩粘贴进来，建立身份并写入。导入后该生会出现在跨学年趋势中（淡化空心点）。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm text-slate-600">
                每行一条：
                <code className="rounded bg-slate-100 px-1">
                  考试名,科目,原始分,等级分,年级百分位,学籍排名
                </code>
                （后三项可省）
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'期中,语文,98\n期中,数学,85'}
                rows={7}
                className="w-full rounded-md border border-slate-200 p-2 font-mono text-sm text-base"
              />
            </div>
            {importMsg && (
              <div className="text-sm text-slate-600">{importMsg}</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                关闭
              </Button>
              <Button onClick={submitImportHistory} disabled={importBusy}>
                {importBusy ? '导入中…' : '导入'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 关联高一学号（新学生） */}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="max-sm:h-screen max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
            <DialogHeader>
              <DialogTitle>关联高一学号 · {profile.name || DASH}</DialogTitle>
              <DialogDescription>
                输入该生的高一学号，建立跨学年关联（用于连续跨学年趋势）。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm text-slate-600">高一学号</label>
              <input
                value={linkSid}
                onChange={(e) => setLinkSid(e.target.value)}
                placeholder="高一学号"
                className="w-full rounded-md border border-slate-200 p-2 text-base font-mono"
              />
            </div>
            {linkMsg && <div className="text-sm text-slate-600">{linkMsg}</div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkOpen(false)}>
                取消
              </Button>
              <Button
                onClick={submitLink}
                disabled={linkBusy || !linkSid.trim()}
              >
                {linkBusy ? '关联中…' : '确认关联'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
