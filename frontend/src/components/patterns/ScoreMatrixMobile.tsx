import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function ScoreMatrixMobile({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-3 md:hidden', className)} {...props} />
}
