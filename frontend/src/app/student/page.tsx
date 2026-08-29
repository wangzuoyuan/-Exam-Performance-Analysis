'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Hash,
  KeyRound,
  Merge,
  Pencil,
  Search,
  TrendingUp,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'

import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { StatCard } from '@/components/patterns/StatCard'
import { AddStudentDialog, DeleteStudentDialog, EditStudentDialog, MergeDialog, SidDialog } from '@/components/student/ManageStudentDialogs'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatGradeLabel } from '@/lib/labels'
import {
  formatChangeSummary,
  formatOpLabel,
  formatStatusLabel,
  isArchived,
  type ChangeLogEntry,
  type ManageStudent,
} from '@/lib/student-management'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function formatInt(value: number | null | undefined): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : String(Math.round(Number(value)))
}

export default function StudentManagePage() {
  const { activeScope, loading: scopeLoading, error: scopeError } = useHomeroomScope()
  const [students, setStudents] = useState<ManageStudent[]>([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [reloadKey, setReloadKey] = useState(0)
  const [showArchived, setShowArchived] = useState(false)

  // 对话框状态
  const [addOpen, setAddOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editStudent, setEditStudent] = useState<ManageStudent | null>(null)
  const [sidStudent, setSidStudent] = useState<ManageStudent | null>(null)
  const [deleteStudent, setDeleteStudent] = useState<ManageStudent | null>(null)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

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

    const params = new URLSearchParams()
    if (showArchived) params.set('include_archived', 'true')
    fetch(`/api/manage/students${params.toString() ? `?${params}` : ''}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取学生名单')
        return (await response.json()) as ManageStudent[]
      })
      .then((rows) => {
        setStudents(rows)
        setState('ready')
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '无法读取学生名单')
        setState('error')
      })

    return () => controller.abort()
  }, [activeScope, reloadKey, scopeLoading, showArchived])

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
        ...(student.aliases ?? []).map((alias) => alias.student_id),
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword))
    )
  }, [query, students])

  const rankedCount = students.filter((student) => student.latest_main_rank != null).length
  const latestExam = students.find((student) => student.latest_exam_name)?.latest_exam_name ?? '—'
  const pendingIdentity = students.filter((student) => student.identity_id == null).length

  function rowActions(student: ManageStudent, size: 'table' | 'card') {
    const iconClass = 'h-11 w-11'
    return (
      <div className={`flex items-center gap-0.5 ${size === 'table' ? 'justify-end' : ''}`}>
        {size === 'table' && (
          <Button asChild variant="ghost" size="icon" className={iconClass}>
            <Link href={`/student/${student.student_id}`} aria-label={`查看${student.name}画像`}><ChevronRight className="h-4 w-4" /></Link>
          </Button>
        )}
        <Button variant="ghost" size="icon" className={iconClass} aria-label={`编辑${student.name}`} onClick={() => setEditStudent(student)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className={iconClass} aria-label={`学号管理${student.name}`} onClick={() => setSidStudent(student)}>
          <KeyRound className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className={iconClass} aria-label={`删除${student.name}`} onClick={() => setDeleteStudent(student)}>
          <Trash2 className="h-4 w-4 text-danger-500" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label ?? 'Student management'}
        title="学生管理"
        description="维护当前班学生主档、学号与在班状态；跨学年学号与历史成绩自动关联。"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="min-h-11"><Link href="/upload"><Upload className="h-4 w-4" />上传成绩</Link></Button>
            <Button variant="outline" className="min-h-11" disabled={students.length < 2} onClick={() => setMergeOpen(true)}><Merge className="h-4 w-4" />合并重复学生</Button>
            <Button className="min-h-11" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" />新增学生</Button>
          </div>
        }
      />

      {!scopeLoading && !activeScope ? (
        <StatePanel
          tone={scopeError ? 'error' : 'first-use'}
          title={scopeError ? '无法读取班级范围' : '请先绑定行政班'}
          description={scopeError || '学生管理必须在明确的年级和行政班范围内进行。'}
          action={<Button asChild variant="outline"><Link href="/upload">前往绑定班级</Link></Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="当前班学生" value={state === 'loading' ? '…' : students.length} unit="人" icon={<Users className="h-4 w-4" />} tone="primary" />
            <StatCard label="有排名记录" value={state === 'loading' ? '…' : rankedCount} unit="人" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="最近考试覆盖" value={<span className="line-clamp-2 text-base leading-snug">{state === 'loading' ? '…' : latestExam}</span>} icon={<GraduationCap className="h-4 w-4" />} className="col-span-2 sm:col-span-1" />
          </div>

          {state === 'ready' && pendingIdentity > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning-500/30 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-foreground">
                有 {pendingIdentity} 名学生尚未建立跨学年主档，建立后改名与跨学年成绩将自动关联。
              </p>
              <BackfillButton onDone={reload} />
            </div>
          )}

          <SectionCard
            title="学生名单"
            description="按座号排序；支持编辑规范姓名、管理学号与删除误建学生。"
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowArchived((value) => !value)}
                  className={`inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-bold ${showArchived ? 'border-brand-500/30 bg-brand-50 text-brand-700' : 'border-border text-muted-foreground hover:bg-muted/65'}`}
                  aria-pressed={showArchived}
                >
                  {showArchived ? '隐藏已归档' : '显示已归档'}
                </button>
                <div className="relative w-44 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按姓名 / 学号搜索" aria-label="搜索学生" className="h-11 pl-9" disabled={state !== 'ready' || students.length === 0} />
                </div>
              </div>
            }
            contentClassName="px-0 pb-0"
          >
            {scopeLoading || state === 'loading' ? (
              <div className="space-y-2 px-5 pb-5" aria-label="正在加载学生名单">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
            ) : state === 'error' ? (
              <StatePanel tone="error" title="学生名单加载失败" description={error} action={<Button variant="outline" onClick={reload}>重新加载</Button>} className="rounded-none border-x-0 border-b-0" />
            ) : students.length === 0 ? (
              <StatePanel tone="empty" title="当前班级暂无学生" description="上传当前班成绩、粘贴名单建花名册，或直接新增学生。" action={<Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" />新增学生</Button>} className="rounded-none border-x-0 border-b-0" />
            ) : visibleStudents.length === 0 ? (
              <StatePanel tone="empty" title="没有匹配的学生" description={`没有找到“${query.trim()}”`} action={<Button variant="outline" onClick={() => setQuery('')}>清除搜索</Button>} className="rounded-none border-x-0 border-b-0" />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12" />
                        <TableHead>学生</TableHead>
                        <TableHead>当前学号</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">主三门总分</TableHead>
                        <TableHead className="text-right">年级名次</TableHead>
                        <TableHead>最近考试</TableHead>
                        <TableHead className="w-44 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleStudents.map((student) => {
                        const history = student.aliases ?? []
                        const open = !!expanded[student.student_id]
                        return (
                          <Fragment key={student.student_id}>
                            <TableRow>
                              <TableCell>
                                {history.length > 0 && (
                                  <button type="button" onClick={() => setExpanded((current) => ({ ...current, [student.student_id]: !open }))} aria-expanded={open} aria-label={open ? '收起历史学号' : '展开历史学号'} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </TableCell>
                              <TableCell>
                                <Link href={`/student/${student.student_id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-extrabold text-foreground hover:text-primary">{student.name}</Link>
                                {!student.in_roster && <Badge variant="outline" className="ml-1 text-[10px]">未建册</Badge>}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{student.student_id}</TableCell>
                              <TableCell>
                                <Badge variant={isArchived(student.status) ? 'outline' : 'secondary'}>{formatStatusLabel(student.status)}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-bold tabular-nums">{formatInt(student.latest_main_score)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatInt(student.latest_main_rank)}</TableCell>
                              <TableCell className="max-w-56 truncate text-muted-foreground">{student.latest_exam_name || '—'}</TableCell>
                              <TableCell className="text-right">{rowActions(student, 'table')}</TableCell>
                            </TableRow>
                            {open && history.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-secondary/35">
                                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    {history.map((alias) => (
                                      <Badge key={alias.student_id} variant="outline" className="font-mono">
                                        {formatGradeLabel(alias.grade)} · {alias.class_num ?? '—'}班 · {alias.student_id}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {visibleStudents.map((student) => (
                    <article key={student.student_id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {/* 画像入口只在底部「画像」按钮一处，避免同一卡片多个重复入口 */}
                          <span className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-base font-extrabold text-foreground">{student.name}</span>
                          <p className="break-all font-mono text-xs text-muted-foreground">{student.student_id}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="secondary">{activeScope?.label ?? '—'}</Badge>
                          <Badge variant={isArchived(student.status) ? 'outline' : 'secondary'} className="text-[10px]">{formatStatusLabel(student.status)}</Badge>
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/35 p-3 text-center">
                        <StudentMetric label="主三门" value={formatInt(student.latest_main_score)} />
                        <StudentMetric label="年级名次" value={formatInt(student.latest_main_rank)} />
                        <StudentMetric label="历史学号" value={String(student.aliases?.length ?? 0)} />
                      </dl>
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">最近考试：{student.latest_exam_name || '—'}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button asChild variant="outline" className="min-h-11 flex-1"><Link href={`/student/${student.student_id}`}>画像<ChevronRight className="h-4 w-4" /></Link></Button>
                        {rowActions(student, 'card')}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          <ChangeLogCard refreshKey={reloadKey} />
        </>
      )}

      <AddStudentDialog open={addOpen} onOpenChange={setAddOpen} onDone={reload} />
      <EditStudentDialog student={editStudent} onOpenChange={(open) => !open && setEditStudent(null)} onDone={reload} />
      <SidDialog student={sidStudent} onOpenChange={(open) => !open && setSidStudent(null)} onDone={reload} />
      <DeleteStudentDialog student={deleteStudent} onOpenChange={(open) => !open && setDeleteStudent(null)} onDone={reload} />
      <MergeDialog open={mergeOpen} students={students} onOpenChange={setMergeOpen} onDone={reload} />
    </div>
  )
}

function BackfillButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/manage/backfill-identities', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? '建立主档失败')
      }
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '建立主档失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run()}>
        <Hash className="h-4 w-4" />{busy ? '建立中…' : '一键建立主档'}
      </Button>
      {error && <p role="alert" className="text-xs font-bold text-danger-600">{error}</p>}
    </div>
  )
}

function ChangeLogCard({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<ChangeLogEntry[] | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/manage/change-log?limit=${expanded ? 50 : 8}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => (response.ok ? ((await response.json()) as ChangeLogEntry[]) : []))
      .then((rows) => setEntries(rows))
      .catch(() => setEntries([]))
    return () => controller.abort()
  }, [expanded, refreshKey])

  return (
    <SectionCard
      title="变更记录"
      description="学生信息的新增、编辑、学号变更、归档、删除与合并都会留痕。"
      action={
        entries && entries.length >= 8 ? (
          <Button variant="ghost" className="min-h-11" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '收起' : '查看更多'}
          </Button>
        ) : null
      }
      contentClassName="px-0 pb-0"
    >
      {!entries ? (
        <div className="space-y-2 px-5 pb-5">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">暂无变更记录。</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
              <Badge variant="outline" className="w-fit shrink-0">{formatOpLabel(entry.op_type)}</Badge>
              <span className="min-w-0 flex-1 break-words text-sm text-foreground">{formatChangeSummary(entry)}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{entry.created_at?.replace('T', ' ') ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function StudentMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-extrabold tabular-nums">{value}</dd></div>
}
