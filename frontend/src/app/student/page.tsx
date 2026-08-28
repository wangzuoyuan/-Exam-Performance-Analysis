'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, GraduationCap, Search, TrendingUp, Upload, Users } from 'lucide-react'

import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { StatCard } from '@/components/patterns/StatCard'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function formatInt(value: number | null | undefined): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : String(Math.round(Number(value)))
}

function formatClass(grade: number | null | undefined, classNum: number | null | undefined): string {
  return grade == null || classNum == null ? '—' : `${formatGradeLabel(grade)} · ${classNum}班`
}

function formatHistory(alias: HistoryAlias): string {
  return `${formatGradeLabel(alias.grade)} · ${alias.class_num ?? '—'}班 · ${alias.student_id}`
}

export default function StudentSearchPage() {
  const { activeScope, loading: scopeLoading, error: scopeError } = useHomeroomScope()
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (scopeLoading) return
    if (!activeScope) {
      setStudents([])
      setState('idle')
      return
    }

    const controller = new AbortController()
    setState('loading')
    setError(null)
    setStudents([])

    fetch('/api/students', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取学生名单')
        return (await response.json()) as StudentSummary[]
      })
      .then((rows) => {
        const scoped = rows
          .map((row) => ({ ...row, history: row.history ?? [] }))
          .filter(
            (row) =>
              row.current_grade === activeScope.grade && row.class_num === activeScope.classNum
          )
          .sort((a, b) => {
            if (a.latest_main_rank == null && b.latest_main_rank == null) return a.student_id.localeCompare(b.student_id)
            if (a.latest_main_rank == null) return 1
            if (b.latest_main_rank == null) return -1
            return a.latest_main_rank - b.latest_main_rank
          })
        setStudents(scoped)
        setState('ready')
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '无法读取学生名单')
        setState('error')
      })

    return () => controller.abort()
  }, [activeScope, reloadKey, scopeLoading])

  useEffect(() => {
    setQuery('')
    setExpanded({})
  }, [activeScope])

  const visibleStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return students
    return students.filter((student) =>
      [
        student.name,
        student.student_id,
        student.latest_exam_name,
        ...(student.history ?? []).map(formatHistory),
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword))
    )
  }, [query, students])

  const rankedCount = students.filter((student) => student.latest_main_rank != null).length
  const latestExam = students.find((student) => student.latest_exam_name)?.latest_exam_name ?? '—'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label ?? 'Student profiles'}
        title="学生视图"
        description="按当前行政班检索学生，并保留跨学年学号与历史成绩关联。"
        actions={<Button asChild className="min-h-11"><Link href="/upload"><Upload className="h-4 w-4" />上传新成绩</Link></Button>}
      />

      {!scopeLoading && !activeScope ? (
        <StatePanel
          tone={scopeError ? 'error' : 'first-use'}
          title={scopeError ? '无法读取班级范围' : '请先绑定行政班'}
          description={scopeError || '学生名单必须在明确的年级和行政班范围内展示。'}
          action={<Button asChild variant="outline"><Link href="/upload">前往绑定班级</Link></Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="当前班学生" value={state === 'loading' ? '…' : students.length} unit="人" icon={<Users className="h-4 w-4" />} tone="primary" />
            <StatCard label="有排名记录" value={state === 'loading' ? '…' : rankedCount} unit="人" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="最近考试覆盖" value={<span className="line-clamp-2 text-base leading-snug">{state === 'loading' ? '…' : latestExam}</span>} icon={<GraduationCap className="h-4 w-4" />} className="col-span-2 sm:col-span-1" />
          </div>

          <SectionCard
            title="学生名单"
            description="默认按最近主三门年级排名排序；展开可核对跨学年学号。"
            action={
              <div className="relative w-44 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按姓名 / 学号搜索" aria-label="搜索学生" className="h-11 pl-9" disabled={state !== 'ready' || students.length === 0} />
              </div>
            }
            contentClassName="px-0 pb-0"
          >
            {scopeLoading || state === 'loading' ? (
              <div className="space-y-2 px-5 pb-5" aria-label="正在加载学生名单">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
            ) : state === 'error' ? (
              <StatePanel tone="error" title="学生名单加载失败" description={error} action={<Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>重新加载</Button>} className="rounded-none border-x-0 border-b-0" />
            ) : students.length === 0 ? (
              <StatePanel tone="empty" title="当前班级暂无学生" description="上传当前班成绩或在升级换届页粘贴名单建花名册后，学生会显示在这里；仅有花名册的学生成绩/名次显示为「—」。" action={<Button asChild><Link href="/upload">上传成绩</Link></Button>} className="rounded-none border-x-0 border-b-0" />
            ) : visibleStudents.length === 0 ? (
              <StatePanel tone="empty" title="没有匹配的学生" description={`没有找到“${query.trim()}”`} action={<Button variant="outline" onClick={() => setQuery('')}>清除搜索</Button>} className="rounded-none border-x-0 border-b-0" />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader><TableRow><TableHead className="w-12" /><TableHead>学生</TableHead><TableHead>当前学号</TableHead><TableHead>当前班级</TableHead><TableHead className="text-right">主三门总分</TableHead><TableHead className="text-right">年级名次</TableHead><TableHead>最近考试</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                    <TableBody>
                      {visibleStudents.map((student) => {
                        const history = student.history ?? []
                        const open = !!expanded[student.student_id]
                        const hasHistory = history.length > 1
                        return (
                          <Fragment key={student.student_id}>
                            <TableRow>
                              <TableCell>{hasHistory && <button type="button" onClick={() => setExpanded((current) => ({ ...current, [student.student_id]: !open }))} aria-expanded={open} aria-label={open ? '收起历史学号' : '展开历史学号'} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-muted"><ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>}</TableCell>
                              <TableCell><Link href={`/student/${student.student_id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-extrabold text-foreground hover:text-primary">{student.name}</Link></TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{student.student_id}</TableCell>
                              <TableCell>{formatClass(student.current_grade, student.class_num)}</TableCell>
                              <TableCell className="text-right font-bold tabular-nums">{formatInt(student.latest_main_score)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatInt(student.latest_main_rank)}</TableCell>
                              <TableCell className="max-w-56 truncate text-muted-foreground">{student.latest_exam_name || '—'}</TableCell>
                              <TableCell><Button asChild variant="ghost" size="icon" className="h-11 w-11"><Link href={`/student/${student.student_id}`} aria-label={`查看${student.name}画像`}><ChevronRight className="h-4 w-4" /></Link></Button></TableCell>
                            </TableRow>
                            {open && hasHistory && <TableRow><TableCell colSpan={8} className="bg-secondary/35"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{history.map((alias) => <Badge key={`${alias.grade}-${alias.student_id}`} variant="outline" className="font-mono">{formatHistory(alias)}</Badge>)}</div></TableCell></TableRow>}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {visibleStudents.map((student) => (
                    <article key={student.student_id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/student/${student.student_id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-base font-extrabold text-foreground">{student.name}</Link><p className="break-all font-mono text-xs text-muted-foreground">{student.student_id}</p></div><Badge variant="secondary">{formatClass(student.current_grade, student.class_num)}</Badge></div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/35 p-3 text-center"><StudentMetric label="主三门" value={formatInt(student.latest_main_score)} /><StudentMetric label="年级名次" value={formatInt(student.latest_main_rank)} /><StudentMetric label="历史学号" value={String(student.history?.length ?? 0)} /></dl>
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">最近考试：{student.latest_exam_name || '—'}</p>
                      <Button asChild variant="outline" className="mt-3 min-h-11 w-full"><Link href={`/student/${student.student_id}`}>查看学生画像<ChevronRight className="h-4 w-4" /></Link></Button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

function StudentMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-extrabold tabular-nums">{value}</dd></div>
}
