import type { ReactNode } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

type StatTone = 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'

interface StatCardProps {
  label: string
  value: ReactNode
  unit?: string
  helper?: ReactNode
  icon?: ReactNode
  href?: string
  tone?: StatTone
  className?: string
}

const toneClass: Record<StatTone, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  accent: 'text-accent-foreground',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600',
}

export function StatCard({
  label,
  value,
  unit,
  helper,
  icon,
  href,
  tone = 'default',
  className,
}: StatCardProps) {
  const body = (
    <Card
      className={cn(
        'h-full transition-colors',
        href && 'hover:border-strong-border hover:bg-secondary/35',
        className
      )}
    >
      <CardContent className="flex h-full min-h-[118px] flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
          <span>{label}</span>
          {icon && <span className="text-primary">{icon}</span>}
        </div>
        <div className="mt-3">
          <div className={cn('flex items-baseline gap-1.5', toneClass[tone])}>
            <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
              {value}
            </span>
            {unit && <span className="text-xs font-bold text-muted-foreground">{unit}</span>}
          </div>
          {helper && <div className="mt-2 text-xs leading-snug text-muted-foreground">{helper}</div>}
        </div>
      </CardContent>
    </Card>
  )

  return href ? (
    <Link href={href} className="block h-full rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {body}
    </Link>
  ) : (
    body
  )
}
