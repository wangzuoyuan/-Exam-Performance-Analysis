import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface SectionCardProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight text-foreground">{title}</h2>
          {description && (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}
