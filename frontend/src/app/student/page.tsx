'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Search,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatGradeLabel } from '@/lib/labels'

interface HistoryAlias {
  grade: number
  student_id: string
  class_num: number | null
}

interface StudentSummary {
  student_id: string
  name: string
  current_grade?: number | null
  class_num?: number | null
  history?: HistoryAlias[]
  latest_exam_name?: string | null
  latest_main_score?: number | null
  latest_main_rank?: number | null
}

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return String(Math.round(Number(n)))
}

/** "高一(6)班" style with parens around class_num, matching plan 04 §3. */
function formatCurrentClass(
  grade: number | null | undefined,
  classNum: number | null | undefined,
): string {
  if (grade == null || classNum == null) return '—'
  return `${formatGradeLabel(grade)}(${classNum})班`
}

function formatHistorySegment(alias: HistoryAlias): string {
  return `${formatGradeLabel(alias.grade)}(${alias.class_num ?? '-'})班·${alias.student_id}`
}

export default function StudentSearchPage() {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const data = await safeJson<StudentSummary[]>('/api/students')
      if (cancelled) return
      const rows = (data ?? []).map((row) => ({
        ...row,
        history: row.history ?? [],
      }))
      // Sort by latest main rank (asc); nulls last; tiebreak by student_id.
      rows.sort((a, b) => {
        if (a.latest_main_rank == null && b.latest_main_rank == null) {
          return a.student_id.localeCompare(b.student_id)
        }
        if (a.latest_main_rank == null) return 1
        if (b.latest_main_rank == null) return -1
        return a.latest_main_rank - b.latest_main_rank
      })
      setStudents(rows)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((student) => {
      const haystack = [
        student.name,
        student.student_id,
        `${student.class_num ?? ''}班`,
        student.latest_exam_name,
        ...(student.history ?? []).map(
          (h) => `${h.student_id} ${formatHistorySegment(h)}`,
        ),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
      return haystack
    })
  }, [students, query])

  const rankedCount = students.filter(
    (student) => student.latest_main_rank != null,
  ).length

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            学生检索
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            按姓名或学号查找学生画像
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="h-4 w-4" />
            上传新成绩
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="学生数"
          value={loading ? '…' : String(students.length)}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="有排名记录"
          value={loading ? '…' : String(rankedCount)}
        />
        <SummaryCard
          icon={<GraduationCap className="h-4 w-4" />}
          label="最近考试覆盖"
          value={loading ? '…' : `${students[0]?.latest_exam_name ?? '—'}`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>学生名单</CardTitle>
            <CardDescription>
              已按学生去重，默认按最新主三门排名排序，点击姓名进入学生趋势页。展开可查看各阶段学号。
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="按姓名 / 学号搜索"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <EmptyState />
          ) : visibleStudents.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              没有匹配的学生
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-32">当前学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead className="w-28">当前班级</TableHead>
                    <TableHead className="w-24 text-right">主三门总分</TableHead>
                    <TableHead className="w-24 text-right">年级名次</TableHead>
                    <TableHead>最近考试</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map((student) => {
                    const history = student.history ?? []
                    const isOpen = !!expanded[student.student_id]
                    const hasHistory = history.length > 1
                    return (
                      <Fragment key={student.student_id}>
                        <TableRow
                          className="hover:bg-slate-50"
                        >
                          <TableCell className="p-2">
                            {hasHistory ? (
                              <button
                                type="button"
                                onClick={() => toggle(student.student_id)}
                                aria-label={isOpen ? '收起历史学号' : '展开历史学号'}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform ${
                                    isOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            {student.student_id}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/student/${student.student_id}`}
                              className="font-medium text-slate-900 hover:text-brand-600"
                            >
                              {student.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {formatCurrentClass(
                              student.current_grade ?? null,
                              student.class_num ?? null,
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatInt(student.latest_main_score)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatInt(student.latest_main_rank)}
                          </TableCell>
                          <TableCell className="text-slate-700">
                            {student.latest_exam_name || '—'}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/student/${student.student_id}`}
                              aria-label={`查看${student.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </TableCell>
                        </TableRow>
                        {isOpen && hasHistory ? (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-slate-50/60 px-6 py-3">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                                <span className="font-medium text-slate-500">
                                  各阶段学号：
                                </span>
                                {history.map((alias, idx) => (
                                  <span key={`${alias.student_id}-${idx}`} className="flex items-center gap-2">
                                    {idx > 0 ? (
                                      <span className="text-slate-400">/</span>
                                    ) : null}
                                    <span className="font-mono">
                                      {formatHistorySegment(alias)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {icon}
          {label}
        </div>
        <div className="mt-2 truncate text-2xl font-semibold text-slate-900">
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Users className="h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">暂无学生数据</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/upload">
          <Upload className="h-4 w-4" />
          前往上传
        </Link>
      </Button>
    </div>
  )
}
