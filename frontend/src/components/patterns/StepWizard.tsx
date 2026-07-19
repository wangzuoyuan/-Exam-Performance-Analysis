'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface WizardStep {
  key: string
  title: string
  description?: string
}

export function StepWizard({
  steps,
  current,
  completed = [],
  onStepChange,
}: {
  steps: WizardStep[]
  current: string
  completed?: string[]
  onStepChange?: (key: string) => void
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === current))

  return (
    <nav aria-label="操作进度" className="overflow-x-auto">
      <ol className="flex min-w-max items-start sm:min-w-0">
        {steps.map((step, index) => {
          const done = completed.includes(step.key)
          const active = step.key === current
          const content = (
            <>
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold tabular-nums', done && 'border-success-600 bg-success-600 text-white', active && !done && 'border-primary bg-primary text-primary-foreground', !active && !done && 'border-strong-border bg-white text-muted-foreground')}>
                {done ? <Check className="h-5 w-5" aria-hidden="true" /> : index + 1}
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className={cn('block text-sm font-extrabold', active ? 'text-foreground' : 'text-muted-foreground')}>{step.title}</span>
                {step.description && <span className="mt-0.5 block text-xs text-muted-foreground">{step.description}</span>}
              </span>
            </>
          )

          return (
            <li key={step.key} className="flex flex-1 items-start" aria-current={active ? 'step' : undefined}>
              {onStepChange ? (
                <button type="button" onClick={() => onStepChange(step.key)} className="flex min-h-11 items-center gap-2 rounded-md pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</button>
              ) : (
                <div className="flex min-h-11 items-center gap-2 pr-2">{content}</div>
              )}
              {index < steps.length - 1 && <span className={cn('mx-2 mt-[22px] h-px min-w-8 flex-1', index < activeIndex || done ? 'bg-success-600' : 'bg-border')} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
