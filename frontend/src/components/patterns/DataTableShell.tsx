import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface DataTableShellProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: boolean
}

export function DataTableShell({ className, maxHeight = false, ...props }: DataTableShellProps) {
  return (
    <div
      className={cn(
        'w-full overflow-auto rounded-lg border border-border bg-white',
        maxHeight && 'max-h-[calc(100vh-18rem)]',
        className
      )}
      {...props}
    />
  )
}
