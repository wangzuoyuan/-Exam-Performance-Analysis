'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BellRing, ShieldCheck } from 'lucide-react'

import { HomeworkNav } from '@/components/homework/HomeworkNav'
import { WarningList, type HomeworkWarningItem } from '@/components/homework/WarningList'
import { PageHeader } from '@/components/patterns/PageHeader'
import { SectionCard } from '@/components/patterns/SectionCard'
import { StatCard } from '@/components/patterns/StatCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Warnings {
  serious: HomeworkWarningItem[]
  warning: HomeworkWarningItem[]
  counts: { serious: number; warning: number; students: number }
}

export default function WarningsPage() {
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const [data, setData] = useState<Warnings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!activeScope) {
      setData(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setData(null)
    void fetch(`/api/homework/warnings?class_num=${activeScope.classNum}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '预警加载失败')
        }
        return response.json() as Promise<Warnings>
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '预警加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [activeScope, reloadKey])

  const all = useMemo(() => [...(data?.serious || []), ...(data?.warning || [])], [data])
  const byStudent = useMemo(() => {
    const grouped = new Map<string, { name: string; studentId: string | null; items: HomeworkWarningItem[] }>()
    all.forEach((item) => {
      const key = item.student_id || item.name
      const group = grouped.get(key) || { name: item.name, studentId: item.student_id || null, items: [] }
      group.items.push(item)
      grouped.set(key, group)
    })
    return Array.from(grouped.values()).sort(
      (left, right) => Math.max(...right.items.map((item) => item.streak)) - Math.max(...left.items.map((item) => item.streak))
    )
  }, [all])
  const bySubject = useMemo(() => {
    const grouped = new Map<string, HomeworkWarningItem[]>()
    all.forEach((item) => grouped.set(item.subject, [...(grouped.get(item.subject) || []), item]))
    return Array.from(grouped.entries())
      .map(([subject, items]) => ({ subject, items: items.sort((left, right) => right.streak - left.streak) }))
      .sort((left, right) => right.items.filter((item) => item.streak >= 3).length - left.items.filter((item) => item.streak >= 3).length || right.items.length - left.items.length)
  }, [all])

  if (!scopeLoading && !activeScope) {
    return (
      <StatePanel
        tone="first-use"
        title="请先绑定并选择行政班"
        description="连续缺交预警必须在当前行政班范围内计算。"
        action={<Button asChild className="min-h-11"><Link href="/upload">前往绑定班级</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={activeScope?.label || '作业跟踪'}
        title="连续缺交预警"
        description="从最近一次收交向前回溯：连续 2 次提醒，连续 3 次及以上严重。"
        actions={<Button asChild variant="outline" className="min-h-11"><Link href="/homework">返回看板</Link></Button>}
      />
      <HomeworkNav current="/homework/warnings" />

      {loading ? (
        <StatePanel tone="loading" title="正在计算连续缺交" />
      ) : error ? (
        <StatePanel
          tone="error"
          title="预警加载失败"
          description={`${error}。页面不会以零值掩盖失败。`}
          action={<Button className="min-h-11" onClick={() => setReloadKey((value) => value + 1)}>重新加载</Button>}
        />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="严重预警" value={data.counts.serious} unit="条" helper="连续 ≥ 3 次" icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
            <StatCard label="提醒预警" value={data.counts.warning} unit="条" helper="连续 2 次" icon={<BellRing className="h-4 w-4" />} tone="warning" />
            <StatCard label="涉及学生" value={data.counts.students} unit="人" helper="已排除不计统计成员" icon={<ShieldCheck className="h-4 w-4" />} className="col-span-2 sm:col-span-1" />
          </div>

          {all.length === 0 ? (
            <StatePanel tone="empty" title="暂无连续缺交预警" description="当前班级没有达到提醒阈值的学生。" />
          ) : (
            <Tabs defaultValue="student">
              <TabsList className="grid h-11 w-full grid-cols-2 sm:w-72">
                <TabsTrigger value="student">按学生</TabsTrigger>
                <TabsTrigger value="subject">按作业种类</TabsTrigger>
              </TabsList>

              <TabsContent value="student" className="mt-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  {byStudent.map((group) => {
                    const maxStreak = Math.max(...group.items.map((item) => item.streak))
                    return (
                      <SectionCard
                        key={group.studentId || group.name}
                        title={
                          group.studentId ? (
                            <Link href={`/student/${group.studentId}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{group.name}</Link>
                          ) : group.name
                        }
                        description={`${group.items.length} 种作业出现连续缺交`}
                        action={<Badge variant={maxStreak >= 3 ? 'destructive' : 'warning'}>最高 {maxStreak} 次</Badge>}
                        contentClassName="pt-0"
                      >
                        <WarningList items={group.items} compact />
                      </SectionCard>
                    )
                  })}
                </div>
              </TabsContent>

              <TabsContent value="subject" className="mt-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  {bySubject.map((group) => (
                    <SectionCard
                      key={group.subject}
                      title={group.subject}
                      description={`${group.items.length} 人 · ${group.items.filter((item) => item.streak >= 3).length} 人严重`}
                      contentClassName="pt-0"
                    >
                      <WarningList items={group.items} compact />
                    </SectionCard>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        统计排除花名册中“不计入统计”的学生；请假等特殊情况不会被当作缺交。
      </p>
    </div>
  )
}
