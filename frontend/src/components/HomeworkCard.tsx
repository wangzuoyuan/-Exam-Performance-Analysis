'use client'

import { useEffect, useState } from 'react'
import { NotebookPen } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatePanel } from '@/components/patterns/StatePanel'

interface WarnItem {
  name: string
  subject: string
  streak: number
  dates: string[]
}
interface RecentRecord {
  date: string
  subject: string
  content: string
}
interface HomeworkSummary {
  student?: { student_id: string; name: string; excluded: boolean }
  total_misses?: number
  miss_by_subject?: Record<string, number>
  special_counts?: Record<string, number>
  active_warnings?: WarnItem[]
  recent_records?: RecentRecord[]
  error?: string
}

export default function HomeworkCard({ studentId }: { studentId: string }) {
  const [data, setData] = useState<HomeworkSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!studentId) return
    const controller = new AbortController()
    setState('loading')
    setError(null)
    setData(null)
    fetch(`/api/homework/student/${studentId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取该生作业记录')
        return (await response.json()) as HomeworkSummary
      })
      .then((result) => {
        if (result.error) throw new Error(result.error)
        setData(result)
        setState('ready')
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '无法读取该生作业记录')
        setState('error')
      })
    return () => controller.abort()
  }, [reloadKey, studentId])

  const subjects = Object.entries(data?.miss_by_subject || {})
  const specials = Object.entries(data?.special_counts || {})
  const warnings = data?.active_warnings || []
  const recent = data?.recent_records || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <NotebookPen className="h-4 w-4" />
          本学期作业缺交
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'loading' ? (
          <div className="space-y-3" role="status" aria-label="正在加载作业记录">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : state === 'error' ? (
          <StatePanel
            tone="error"
            title="作业记录加载失败"
            description={error}
            action={<button type="button" onClick={() => setReloadKey((key) => key + 1)} className="min-h-11 rounded-md border border-border px-4 text-sm font-bold hover:bg-muted">重新加载</button>}
            className="border-0 p-0"
          />
        ) : (
          <>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="text-3xl font-semibold text-slate-900">
              {data?.total_misses ?? '—'}
            </span>
            <span className="ml-1 text-sm text-slate-500">次缺交</span>
          </div>
          {specials.length > 0 && (
            <div className="text-sm text-slate-500">
              {specials.map(([t, c]) => `${t} ${c} 次`).join(' · ')}
            </div>
          )}
          {data?.student?.excluded && (
            <Badge className="border-transparent bg-slate-100 text-slate-500">不计入统计</Badge>
          )}
        </div>

        {subjects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {subjects.map(([sub, count]) => (
              <span
                key={sub}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
              >
                {sub} <span className="font-medium text-slate-800">{count}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">本学期暂无缺交记录</p>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <div className="text-xs font-medium text-slate-500">连续缺交预警</div>
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge
                  className={
                    w.streak >= 3
                      ? 'border-transparent bg-danger-50 text-danger-600'
                      : 'border-transparent bg-warning-50 text-warning-700'
                  }
                >
                  连续{w.streak}次
                </Badge>
                <span className="text-slate-600">{w.subject}</span>
                <span className="text-xs text-slate-400">
                  {w.dates[0]?.slice(5)} ~ {w.dates[w.dates.length - 1]?.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <details className="border-t border-slate-100 pt-3" open>
            <summary className="cursor-pointer text-xs font-medium text-slate-500">
              近期缺交明细（{recent.length} 条）
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1 font-normal">日期</th>
                  <th className="py-1 font-normal">学科</th>
                  <th className="py-1 font-normal">说明</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-t border-slate-50">
                    <td className="py-1.5 text-slate-500">{r.date}</td>
                    <td className="py-1.5 text-slate-700">{r.subject}</td>
                    <td className="py-1.5 text-slate-500">{r.content || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        <p className="text-xs text-slate-400">
          仅含缺交、请假、迟到等记录，不代表作业完成质量。
        </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
