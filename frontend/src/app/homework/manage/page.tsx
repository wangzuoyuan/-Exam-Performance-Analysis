'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Trash2, X } from 'lucide-react'

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

interface ManageRecord {
  id: number
  name: string
  date: string
  subject: string
  content: string
  remark: string
  is_special: boolean
}

interface Filters {
  student: string
  date: string
  subject: string
}

export default function HomeworkManagePage() {
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const [filters, setFilters] = useState<Filters>({ student: '', date: '', subject: '' })
  const [applied, setApplied] = useState<Filters>({ student: '', date: '', subject: '' })
  const [ready, setReady] = useState(false)
  const [records, setRecords] = useState<ManageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [mutationError, setMutationError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initial = {
      date: params.get('date') || '',
      student: params.get('student') || '',
      subject: params.get('subject') || '',
    }
    setFilters(initial)
    setApplied(initial)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready || !activeScope) return
    const controller = new AbortController()
    const params = new URLSearchParams({ class_num: String(activeScope.classNum) })
    if (applied.student) params.set('student', applied.student)
    if (applied.date) params.set('date', applied.date)
    if (applied.subject) params.set('subject', applied.subject)
    setLoading(true)
    setError(null)
    setRecords([])

    void fetch(`/api/homework/manage/records?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '记录加载失败')
        }
        return response.json() as Promise<ManageRecord[]>
      })
      .then((result) => {
        if (!controller.signal.aborted) setRecords(result)
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '记录加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeScope, applied, ready, reloadKey])

  const remove = useCallback(async (record: ManageRecord) => {
    if (!activeScope || !confirm(`删除 ${record.name} 的这条记录？`)) return
    setMutationError(null)
    const base = record.is_special ? '/api/homework/special-records' : '/api/homework/manage/records'
    try {
      const response = await fetch(`${base}/${record.id}?class_num=${activeScope.classNum}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || '删除失败')
      }
      setReloadKey((value) => value + 1)
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '删除失败')
    }
  }, [activeScope])

  const clearFilters = () => {
    const empty = { student: '', date: '', subject: '' }
    setFilters(empty)
    setApplied(empty)
  }

  if (!scopeLoading && !activeScope) {
    return (
      <StatePanel
        tone="first-use"
        title="请先绑定并选择行政班"
        description="记录管理不会在缺少班级范围时查询全量数据。"
        action={<Button asChild className="min-h-11"><Link href="/upload">前往绑定班级</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label || '作业跟踪'}
        title="记录管理"
        description="检索缺交和特殊情况记录；作业种类继续使用 subject 字段。"
        actions={<Button asChild variant="outline" className="min-h-11"><Link href="/homework">返回看板</Link></Button>}
      />
      <HomeworkNav current="/homework/manage" />

      <SectionCard title="筛选记录" description="最多显示最近 200 条匹配记录。">
        <FilterBar>
          <label className="flex-1 text-xs font-bold text-muted-foreground sm:min-w-44">
            学生姓名
            <Input
              value={filters.student}
              onChange={(event) => setFilters((current) => ({ ...current, student: event.target.value }))}
              placeholder="支持姓名片段"
              className="mt-1 min-h-11"
            />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            日期
            <Input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
              className="mt-1 min-h-11"
            />
          </label>
          <label className="flex-1 text-xs font-bold text-muted-foreground sm:min-w-36">
            作业种类
            <Input
              value={filters.subject}
              onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
              placeholder="例如：数学"
              className="mt-1 min-h-11"
            />
          </label>
          <Button className="min-h-11" onClick={() => setApplied(filters)}>
            <Search className="h-4 w-4" />查询
          </Button>
          {(applied.student || applied.date || applied.subject) && (
            <Button variant="ghost" className="min-h-11" onClick={clearFilters}>
              <X className="h-4 w-4" />清空
            </Button>
          )}
        </FilterBar>
      </SectionCard>

      {mutationError && <div role="alert" className="rounded-lg border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-700">{mutationError}</div>}

      <SectionCard title={`记录明细${!loading && !error ? ` · ${records.length}` : ''}`} description="特殊情况与缺交记录分开标识。">
        {loading ? (
          <StatePanel tone="loading" title="正在加载记录" className="py-8" />
        ) : error ? (
          <StatePanel
            tone="error"
            title="记录加载失败"
            description={error}
            action={<Button className="min-h-11" onClick={() => setReloadKey((value) => value + 1)}>重试</Button>}
          />
        ) : records.length === 0 ? (
          <StatePanel tone="empty" title="没有匹配记录" description="可调整筛选条件，或返回看板录入新记录。" />
        ) : (
          <>
            <DataTableShell maxHeight className="hidden md:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>作业种类 / 情况</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={`${record.is_special ? 'special' : 'homework'}-${record.id}`}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{record.date}</TableCell>
                      <TableCell className="font-extrabold text-foreground">{record.name}</TableCell>
                      <TableCell><Badge variant={record.is_special ? 'warning' : 'secondary'}>{record.is_special ? '特殊' : '缺交'}</Badge></TableCell>
                      <TableCell>{record.is_special ? record.remark : record.subject}</TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">{record.content || record.remark || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-danger-600" onClick={() => void remove(record)} aria-label={`删除 ${record.name} 的记录`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>

            <div className="space-y-3 md:hidden">
              {records.map((record) => (
                <article key={`${record.is_special ? 'special' : 'homework'}-${record.id}`} className="rounded-lg border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-foreground">{record.name}</h3>
                        <Badge variant={record.is_special ? 'warning' : 'secondary'}>{record.is_special ? '特殊' : '缺交'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{record.date}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-danger-600" onClick={() => void remove(record)} aria-label={`删除 ${record.name} 的记录`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
                    <dt className="text-muted-foreground">作业种类/情况</dt>
                    <dd className="font-bold text-foreground">{record.is_special ? record.remark : record.subject}</dd>
                    <dt className="text-muted-foreground">说明</dt>
                    <dd className="text-foreground">{record.content || record.remark || '—'}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
