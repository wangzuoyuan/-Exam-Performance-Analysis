import Link from 'next/link'
import { BarChart3, ClipboardList, LayoutDashboard, Settings2, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

const items = [
  { href: '/homework', label: '作业看板', icon: LayoutDashboard },
  { href: '/homework/manage', label: '记录管理', icon: ClipboardList },
  { href: '/homework/warnings', label: '连续缺交', icon: TriangleAlert },
  { href: '/homework/correlation', label: '缺交 × 成绩', icon: BarChart3 },
  { href: '/homework/settings', label: '作业设置', icon: Settings2 },
]

export function HomeworkNav({ current }: { current: string }) {
  return (
    <nav aria-label="作业模块导航" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.href === current
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-white text-muted-foreground hover:border-strong-border hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
