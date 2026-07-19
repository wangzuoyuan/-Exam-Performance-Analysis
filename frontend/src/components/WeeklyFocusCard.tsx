'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCircle2, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/components/patterns/SectionCard'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'

interface FocusStudent {
  student_id: string
  name: string
  score: number
  reasons: string[]
}

interface WeeklyFocus {
  week: { start: string; end: string }
  students: FocusStudent[]
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function reasonStyle(reason: string): string {
  if (reason.startsWith('连续缺交')) return 'border-danger-200 bg-danger-50 text-danger-700'
  if (reason.startsWith('本周缺交激增')) return 'border-warning-200 bg-warning-50 text-warning-700'
  if (reason.startsWith('谈话跟进')) return 'border-primary/20 bg-brand-50 text-brand-700'
  return 'border-border bg-secondary text-muted-foreground'
}

export default function WeeklyFocusCard({ classNum: explicitClassNum }: { classNum?: number }) {
  const { activeScope, loading: scopeLoading } = useHomeroomScope()
  const classNum = explicitClassNum ?? activeScope?.classNum
  const grade = activeScope?.grade
  const [data, setData] = useState<WeeklyFocus | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  useEffect(() => {
    if (scopeLoading) return
    if (classNum == null) {
      setData(null)
      setState('ready')
      return
    }

    const controller = new AbortController()
    setData(null)
    setState('loading')
    fetch(`/api/weekly-focus?class_num=${classNum}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('本周关注加载失败')
        return (await response.json()) as WeeklyFocus
      })
      .then((result) => {
        setData(result)
        setState('ready')
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setState('error')
      })

    return () => controller.abort()
  }, [classNum, grade, reloadKey, scopeLoading])

  const students = data?.students ?? []
  const weekLabel = data
    ? `${data.week.start.slice(5)}—${data.week.end.slice(5)}`
    : activeScope?.label

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning-600" />
          本周关注
          {state === 'ready' && <Badge variant="warning">{students.length} 人</Badge>}
        </span>
      }
      description="合并成绩预警、连续缺交与待跟进事项"
      action={<span className="text-xs text-muted-foreground tabular-nums">{weekLabel}</span>}
      className="border-warning-500/25"
    >
      {state === 'idle' || state === 'loading' ? (
        <div className="space-y-2" aria-label="正在加载本周关注">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-semibold text-foreground">暂时无法读取本周关注</p>
          <Button variant="outline" size="sm" className="min-h-11" onClick={reload}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
        </div>
      ) : students.length === 0 ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
          <CheckCircle2 className="h-9 w-9 text-success-500" />
          <p className="text-sm font-bold text-foreground">本周暂无重点关注</p>
          <p className="text-xs text-muted-foreground">系统仍会每日检查成绩、作业和跟进记录。</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {students.slice(0, 8).map((student) => (
            <div
              key={student.student_id}
              className="flex min-h-14 flex-col justify-center gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/student/${student.student_id}`}
                className="flex min-h-11 min-w-24 items-center text-sm font-extrabold text-foreground hover:text-primary hover:underline"
              >
                {student.name || student.student_id}
              </Link>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {student.reasons.map((reason, index) => (
                  <Badge key={`${reason}-${index}`} variant="outline" className={reasonStyle(reason)}>
                    {reason}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {students.length > 8 && (
            <p className="pt-3 text-center text-xs text-muted-foreground">
              另有 {students.length - 8} 人需关注
            </p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
