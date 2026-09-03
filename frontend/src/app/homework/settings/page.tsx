'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Save, Trash2, UserRoundX } from 'lucide-react'

import { HomeworkNav } from '@/components/homework/HomeworkNav'
import { DataTableShell } from '@/components/patterns/DataTableShell'
import { FilterBar } from '@/components/patterns/FilterBar'
import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface Semester {
  semester_start: string
  semester_end: string
  semester_name: string
}
interface SemesterHistory {
  id: number | null
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  auto: boolean
}
interface RosterRow {
  student_id: string
  name: string
  seat_no: number | null
  gender: string | null
  excluded: number
  record_count: number
}

export default function HomeworkSettingsPage() {
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const [semester, setSemester] = useState<Semester>({ semester_start: '', semester_end: '', semester_name: '' })
  const [semesters, setSemesters] = useState<SemesterHistory[]>([])
  const [newSemester, setNewSemester] = useState({ name: '', start_date: '', end_date: '' })
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [newName, setNewName] = useState('')
  const [newSeat, setNewSeat] = useState('')

  useEffect(() => {
    if (!activeScope) {
      setRoster([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/homework/semester?class_num=${activeScope.classNum}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/homework/roster?class_num=${activeScope.classNum}`, { cache: 'no-store', signal: controller.signal }),
      fetch('/api/homework/semesters', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([semesterResponse, rosterResponse, semestersResponse]) => {
        if (!semesterResponse.ok || !rosterResponse.ok || !semestersResponse.ok) {
          const failed = !semesterResponse.ok ? semesterResponse : !rosterResponse.ok ? rosterResponse : semestersResponse
          const body = await failed.json().catch(() => ({}))
          throw new Error(body.detail || '设置加载失败')
        }
        return Promise.all([
          semesterResponse.json() as Promise<Semester>,
          rosterResponse.json() as Promise<RosterRow[]>,
          semestersResponse.json() as Promise<SemesterHistory[]>,
        ])
      })
      .then(([semesterResult, rosterResult, semestersResult]) => {
        if (controller.signal.aborted) return
        setSemester(semesterResult)
        setRoster(rosterResult)
        setSemesters(semestersResult)
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '设置加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [activeScope, reloadKey])

  const mutate = useCallback(async (url: string, init: RequestInit, success: string) => {
    setNotice(null)
    const response = await fetch(url, init)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || '操作失败')
    setNotice({ tone: 'success', text: success })
    setReloadKey((value) => value + 1)
  }, [])

  const saveSemester = async () => {
    if (!activeScope) return
    try {
      await mutate(`/api/homework/semester?class_num=${activeScope.classNum}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(semester),
      }, '学期配置已保存')
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '保存失败' })
    }
  }

  const addSemester = async () => {
    if (!newSemester.start_date || !newSemester.end_date) return
    try {
      await mutate('/api/homework/semesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSemester, make_current: false }),
      }, '已添加历史学期')
      setNewSemester({ name: '', start_date: '', end_date: '' })
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '添加失败' })
    }
  }

  const makeCurrent = async (id: number) => {
    try {
      await mutate(`/api/homework/semesters/${id}/current`, { method: 'PUT' }, '已切换当前学期')
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '切换失败' })
    }
  }

  const addStudent = async () => {
    if (!newName.trim() || !activeScope) return
    try {
      await mutate('/api/homework/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          seat_no: newSeat ? Number(newSeat) : null,
          class_num: activeScope.classNum,
          grade: activeScope.grade,
        }),
      }, `已添加 ${newName.trim()}`)
      setNewName('')
      setNewSeat('')
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '添加失败' })
    }
  }

  const toggleExcluded = async (row: RosterRow) => {
    if (!activeScope) return
    try {
      await mutate(`/api/homework/roster/${row.student_id}/toggle-excluded?class_num=${activeScope.classNum}`, { method: 'PUT' }, `${row.name} 已${row.excluded ? '恢复计入' : '排除统计'}`)
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '操作失败' })
    }
  }

  const removeStudent = async (row: RosterRow) => {
    if (!activeScope || !confirm(`删除 ${row.name}？会同时删除其 ${row.record_count} 条作业记录。`)) return
    try {
      await mutate(`/api/homework/roster/${row.student_id}?class_num=${activeScope.classNum}`, { method: 'DELETE' }, `已删除 ${row.name}`)
    } catch (cause) {
      setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : '删除失败' })
    }
  }

  if (!scopeLoading && !activeScope) {
    return (
      <StatePanel
        tone="first-use"
        title="请先绑定并选择行政班"
        description="花名册与排除规则必须归属于明确的行政班。"
        action={<Button asChild className="min-h-11"><Link href="/upload">前往绑定班级</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label || '作业跟踪'}
        title="作业设置"
        description="维护学期区间、当前班花名册和统计排除规则。"
        actions={<Button asChild variant="outline" className="min-h-11"><Link href="/homework">返回看板</Link></Button>}
      />
      <HomeworkNav current="/homework/settings" />

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm font-bold', notice.tone === 'error' ? 'border-danger-500/30 bg-danger-50 text-danger-700' : 'border-success-500/30 bg-success-50 text-success-700')}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <StatePanel tone="loading" title="正在加载作业设置" />
      ) : error ? (
        <StatePanel
          tone="error"
          title="设置加载失败"
          description={error}
          action={<Button className="min-h-11" onClick={() => setReloadKey((value) => value + 1)}>重新加载</Button>}
        />
      ) : (
        <>
          <SectionCard title="学期配置" description="起止日期决定看板与统计的默认时间区间。">
            <FilterBar>
              <label className="text-xs font-bold text-muted-foreground">
                起始日期
                <Input type="date" value={semester.semester_start} onChange={(event) => setSemester((current) => ({ ...current, semester_start: event.target.value }))} className="mt-1 min-h-11" />
              </label>
              <label className="text-xs font-bold text-muted-foreground">
                结束日期
                <Input type="date" value={semester.semester_end} onChange={(event) => setSemester((current) => ({ ...current, semester_end: event.target.value }))} className="mt-1 min-h-11" />
              </label>
              <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground sm:min-w-64">
                学期名称
                <Input value={semester.semester_name} onChange={(event) => setSemester((current) => ({ ...current, semester_name: event.target.value }))} placeholder="2025-2026学年第二学期" className="mt-1 min-h-11" />
              </label>
              <Button className="min-h-11" onClick={() => void saveSemester()}><Save className="h-4 w-4" />保存</Button>
            </FilterBar>
          </SectionCard>

          <SectionCard title="历史学期" description="保存往期学期后可随时切换查看；未配置时按日期自动推算当前学期（9~1 月为第一学期，2~6 月为第二学期，7~8 月暑假沿用刚结束的第二学期）。">
            <FilterBar className="mb-4">
              <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground sm:max-w-56">
                学期名称
                <Input value={newSemester.name} onChange={(event) => setNewSemester((current) => ({ ...current, name: event.target.value }))} placeholder="如 2025学年第一学期" className="mt-1 min-h-11" />
              </label>
              <label className="text-xs font-bold text-muted-foreground">
                起始日期
                <Input type="date" value={newSemester.start_date} onChange={(event) => setNewSemester((current) => ({ ...current, start_date: event.target.value }))} className="mt-1 min-h-11" />
              </label>
              <label className="text-xs font-bold text-muted-foreground">
                结束日期
                <Input type="date" value={newSemester.end_date} onChange={(event) => setNewSemester((current) => ({ ...current, end_date: event.target.value }))} className="mt-1 min-h-11" />
              </label>
              <Button variant="outline" className="min-h-11" onClick={() => void addSemester()} disabled={!newSemester.start_date || !newSemester.end_date}>
                <Plus className="h-4 w-4" />添加历史学期
              </Button>
            </FilterBar>
            {semesters.length === 0 ? (
              <StatePanel tone="empty" title="暂无历史学期" description="未配置时按日期自动推算当前学期，添加后可手动切换。" />
            ) : (
              <div className="space-y-2">
                {semesters.map((item) => (
                  <div key={item.id ?? item.name} className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-white p-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-foreground">{item.name}</span>
                        {item.is_current && <Badge>当前</Badge>}
                        {item.auto && <Badge variant="secondary">自动推算</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.start_date} 至 {item.end_date}</p>
                    </div>
                    {!item.is_current && (
                      <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void makeCurrent(item.id!)}>设为当前学期</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={`花名册 · ${roster.length} 人`}
            description="排除后，其缺交不进入看板、排行、预警和相关性；删除会同时清理该成员作业记录。"
            action={<Badge variant="warning"><UserRoundX className="mr-1 h-3.5 w-3.5" />已排除 {roster.filter((row) => row.excluded).length} 人</Badge>}
          >
            <FilterBar className="mb-4">
              <label className="text-xs font-bold text-muted-foreground sm:w-24">
                座号
                <Input value={newSeat} onChange={(event) => setNewSeat(event.target.value)} inputMode="numeric" placeholder="可选" className="mt-1 min-h-11" />
              </label>
              <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground sm:max-w-56">
                姓名
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新增占位成员" className="mt-1 min-h-11" />
              </label>
              <Button variant="outline" className="min-h-11" onClick={() => void addStudent()} disabled={!newName.trim()}>
                <Plus className="h-4 w-4" />添加学生
              </Button>
            </FilterBar>

            {roster.length === 0 ? (
              <StatePanel tone="empty" title="当前班级暂无花名册" description="可手动添加占位成员，或通过上传流程同步正式花名册。" />
            ) : (
              <>
                <DataTableShell maxHeight className="hidden md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white">
                      <TableRow>
                        <TableHead>座号</TableHead>
                        <TableHead>姓名</TableHead>
                        <TableHead>性别</TableHead>
                        <TableHead className="text-right">记录数</TableHead>
                        <TableHead className="text-center">排除统计</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roster.map((row) => (
                        <TableRow key={row.student_id} className={cn(row.excluded && 'bg-secondary/35 text-muted-foreground')}>
                          <TableCell>{row.seat_no ?? '—'}</TableCell>
                          <TableCell className="font-extrabold">{row.name}{row.excluded === 1 && <Badge variant="secondary" className="ml-2">不计入</Badge>}</TableCell>
                          <TableCell>{row.gender ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.record_count}</TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.excluded === 1}
                              aria-label={`${row.name}排除统计`}
                              onClick={() => void toggleExcluded(row)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className={cn('relative inline-flex h-6 w-10 items-center rounded-full transition-colors', row.excluded ? 'bg-warning-500' : 'bg-muted')}>
                                <span className={cn('h-5 w-5 rounded-full bg-white transition-transform', row.excluded ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                              </span>
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-danger-600" onClick={() => void removeStudent(row)} aria-label={`删除 ${row.name}`}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataTableShell>

                <div className="space-y-3 md:hidden">
                  {roster.map((row) => (
                    <article key={row.student_id} className={cn('rounded-lg border border-border bg-white p-4', row.excluded && 'bg-secondary/35')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-foreground">{row.name}</h3>{row.excluded === 1 && <Badge variant="secondary">不计入统计</Badge>}</div>
                          <p className="mt-1 text-xs text-muted-foreground">座号 {row.seat_no ?? '—'} · {row.gender ?? '性别未填'} · {row.record_count} 条记录</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-danger-600" onClick={() => void removeStudent(row)} aria-label={`删除 ${row.name}`}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.excluded === 1}
                        onClick={() => void toggleExcluded(row)}
                        className="mt-3 flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-white px-3 text-sm font-bold text-foreground"
                      >
                        排除该生统计
                        <span className={cn('relative inline-flex h-6 w-10 items-center rounded-full transition-colors', row.excluded ? 'bg-warning-500' : 'bg-muted')}><span className={cn('h-5 w-5 rounded-full bg-white transition-transform', row.excluded ? 'translate-x-[18px]' : 'translate-x-0.5')} /></span>
                      </button>
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
