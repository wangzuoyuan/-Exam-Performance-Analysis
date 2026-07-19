import type { ReactNode } from 'react'
import { AlertCircle, Inbox, Loader2, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

type StateTone = 'loading' | 'empty' | 'error' | 'first-use'

interface StatePanelProps {
  tone: StateTone
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

const stateStyles: Record<StateTone, { icon: typeof Inbox; shell: string; iconBox: string }> = {
  loading: {
    icon: Loader2,
    shell: 'border-border bg-card',
    iconBox: 'bg-brand-50 text-brand-700',
  },
  empty: {
    icon: Inbox,
    shell: 'border-border bg-card',
    iconBox: 'bg-muted text-muted-foreground',
  },
  error: {
    icon: AlertCircle,
    shell: 'border-danger-500/30 bg-danger-50/55',
    iconBox: 'bg-white text-danger-600',
  },
  'first-use': {
    icon: Sparkles,
    shell: 'border-warning-500/30 bg-warning-50/65',
    iconBox: 'bg-white text-warning-700',
  },
}

export function StatePanel({ tone, title, description, action, className }: StatePanelProps) {
  const style = stateStyles[tone]
  const Icon = style.icon
  return (
    <div className={cn('flex flex-col items-center rounded-lg border px-5 py-9 text-center', style.shell, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={cn('mb-3 grid h-10 w-10 place-items-center rounded-full', style.iconBox)}>
        <Icon className={cn('h-5 w-5', tone === 'loading' && 'animate-spin')} />
      </span>
      <h2 className="text-base font-extrabold text-foreground">{title}</h2>
      {description && <div className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
