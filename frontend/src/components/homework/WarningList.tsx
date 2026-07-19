import Link from 'next/link'

import { Badge } from '@/components/ui/badge'

export interface HomeworkWarningItem {
  name: string
  student_id?: string | null
  subject: string
  streak: number
  dates: string[]
}

function rangeLabel(dates: string[]) {
  if (!dates.length) return '日期未知'
  return `${dates[0].slice(5)} – ${dates[dates.length - 1].slice(5)}`
}

export function WarningList({ items, compact = false }: { items: HomeworkWarningItem[]; compact?: boolean }) {
  return (
    <div className="divide-y divide-border">
      {items.map((item, index) => (
        <div key={`${item.student_id || item.name}-${item.subject}-${index}`} className="flex min-h-14 items-center gap-3 py-2.5">
          <Badge variant={item.streak >= 3 ? 'destructive' : 'warning'} className="shrink-0">
            {item.streak >= 3 ? '严重' : '提醒'} · {item.streak}次
          </Badge>
          <div className="min-w-0 flex-1">
            {item.student_id ? (
              <Link
                href={`/student/${item.student_id}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 font-extrabold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.name}
              </Link>
            ) : (
              <span className="font-extrabold text-foreground">{item.name}</span>
            )}
            <p className="text-xs text-muted-foreground">{item.subject} · {rangeLabel(item.dates)}</p>
          </div>
          {!compact && <span className="hidden text-xs font-bold text-muted-foreground sm:block">连续缺交</span>}
        </div>
      ))}
    </div>
  )
}
