import type { ReactNode } from 'react'

import { SectionCard } from '@/components/patterns/SectionCard'

interface ChartPanelProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartPanel({ title, description, action, children, className }: ChartPanelProps) {
  return (
    <SectionCard
      title={title}
      description={description}
      action={action}
      className={className}
      contentClassName="min-w-0"
    >
      {children}
    </SectionCard>
  )
}
