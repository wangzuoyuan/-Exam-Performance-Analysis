'use client'

import Link from 'next/link'
import { Loader2, School } from 'lucide-react'

import { useHomeroomScope, type HomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ScopeSelectProps {
  className?: string
  compact?: boolean
}

export function ScopeSelect({ className, compact = false }: ScopeSelectProps) {
  const { scopes, activeScope, loading, switching, error, selectScope } = useHomeroomScope()

  if (loading) {
    return (
      <div
        className={cn(
          'flex h-11 min-w-36 items-center gap-2 rounded-md border border-border bg-white px-3 text-xs text-muted-foreground',
          className
        )}
        aria-label="正在读取当前班级"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        读取班级…
      </div>
    )
  }

  if (scopes.length === 0) {
    return (
      <Link
        href="/upload"
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-md border border-warning-500/35 bg-warning-50 px-3 text-xs font-bold text-warning-700 transition-colors hover:border-warning-500/60 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className
        )}
      >
        <School className="h-3.5 w-3.5" />
        先绑定班级
      </Link>
    )
  }

  return (
    <div className={cn('min-w-0', className)} title={error ?? undefined}>
      <Select
        value={activeScope ? String(activeScope.grade) : undefined}
        onValueChange={(value) => {
          void selectScope(Number(value) as HomeroomScope['grade']).catch(() => {})
        }}
        disabled={switching}
      >
        <SelectTrigger
          className={cn(
            'h-11 border-brand-500/45 bg-white font-bold text-foreground shadow-none focus:ring-brand-500',
            compact ? 'w-[148px]' : 'w-full sm:w-[176px]'
          )}
          aria-label="切换当前班级"
        >
          <span className="mr-2 flex min-w-0 items-center gap-2">
            {switching ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" />
            ) : (
              <School className="h-3.5 w-3.5 shrink-0 text-accent-foreground" />
            )}
            <SelectValue placeholder="选择当前班级" />
          </span>
        </SelectTrigger>
        <SelectContent align="end">
          {scopes.map((scope) => (
            <SelectItem key={scope.grade} value={String(scope.grade)}>
              {scope.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  )
}
