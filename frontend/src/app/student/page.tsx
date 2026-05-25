'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight,
  GraduationCap,
  Search,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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

interface Exam {
  id: number
  name: string
  grade: number
  exam_date?: string | null
}

interface StudentRow {
  student_id: string
  name: string
  class_num?: number | null
  total_score?: number | null
  grade_rank?: number | null
}

interface ExamDetailResponse {
  exam: Exam
  students?: StudentRow[]
}

interface StudentSummary {
  student_id: string
  name: string
  class_num?: number | null
  latest_exam_id: number
  latest_exam_name: string
  latest_exam_date?: string | null
  latest_grade: number
  total_score?: number | null
  grade_rank?: number | null
  exam_count: number
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

function aggregateStudents(details: ExamDetailResponse[]): StudentSummary[] {
  const map = new Map<string, StudentSummary>()

  for (const detail of details) {
    for (const row of detail.students ?? []) {
      const existing = map.get(row.student_id)
      if (!existing) {
        map.set(row.student_id, {
          student_id: row.student_id,
          name: row.name || row.student_id,
          class_num: row.class_num,
          latest_exam_id: detail.exam.id,
          latest_exam_name: detail.exam.name,
          latest_exam_date: detail.exam.exam_date,
          latest_grade: detail.exam.grade,
          total_score: row.total_score,
          grade_rank: row.grade_rank,
          exam_count: 1,
        })
      } else {
        existing.exam_count += 1
        if (!existing.name || existing.name === existing.student_id) {
          existing.name = row.name || row.student_id
        }
        if (existing.class_num == null && row.class_num != null) {
          existing.class_num = row.class_num
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.grade_rank == null && b.grade_rank == null) {
      return a.student_id.localeCompare(b.student_id)
    }
    if (a.grade_rank == null) return 1
    if (b.grade_rank == null) return -1
    return a.grade_rank - b.grade_rank
  })
}

export default function StudentSearchPage() {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const examsRes = await safeJson<{ exams?: Exam[] }>('/api/exams')
      const exams = examsRes?.exams ?? []
      const details = await Promise.all(
        exams.map((exam) => safeJson<ExamDetailResponse>(`/api/exams/${exam.id}`))
      )
      if (cancelled) return

      setStudents(aggregateStudents(details.filter(Boolean) as ExamDetailResponse[]))
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
    return students.filter((student) =>
      [
        student.name,
        student.student_id,
        `${student.class_num ?? ''}班`,
        student.latest_exam_name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [students, query])

  const rankedCount = students.filter((student) => student.grade_rank != null).length

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
              默认按最新考试的年级名次排序，点击姓名进入学生趋势页。
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
                    <TableHead className="w-28">学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead className="w-20">班级</TableHead>
                    <TableHead className="w-24 text-right">最新总分</TableHead>
                    <TableHead className="w-24 text-right">年级名次</TableHead>
                    <TableHead>最近考试</TableHead>
                    <TableHead className="w-20 text-right">考试数</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map((student) => (
                    <TableRow key={student.student_id} className="hover:bg-slate-50">
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
                        {student.class_num != null ? `${student.class_num}班` : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(student.total_score)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(student.grade_rank)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/exam/${student.latest_exam_id}`}
                          className="text-slate-700 hover:text-brand-600"
                        >
                          {student.latest_exam_name}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <Badge variant="secondary">{formatGradeLabel(student.latest_grade)}</Badge>
                          <span>{student.latest_exam_date || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {student.exam_count}
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
                  ))}
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
