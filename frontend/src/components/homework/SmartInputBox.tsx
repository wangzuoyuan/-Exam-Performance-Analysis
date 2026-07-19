'use client'

import { useMemo } from 'react'
import { CheckCircle2, CornerDownRight, Loader2, Send, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface HomeworkSubmitFeedback {
  tone: 'success' | 'partial' | 'error'
  title: string
  details?: string[]
}

interface SmartInputBoxProps {
  raw: string
  onRawChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
  mode: 'by_student' | 'by_subject'
  onModeChange: (value: 'by_student' | 'by_subject') => void
  submitting: boolean
  feedback: HomeworkSubmitFeedback | null
  onSubmit: () => void
}

export function SmartInputBox({
  raw,
  onRawChange,
  date,
  onDateChange,
  mode,
  onModeChange,
  submitting,
  feedback,
  onSubmit,
}: SmartInputBoxProps) {
  const preview = useMemo(
    () =>
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separator = line.search(/[:：]/)
          return separator < 1
            ? { source: line, valid: false, left: line, right: '' }
            : {
                source: line,
                valid: true,
                left: line.slice(0, separator).trim(),
                right: line.slice(separator + 1).trim(),
              }
        }),
    [raw]
  )
  const invalidCount = preview.filter((line) => !line.valid).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-xs font-bold text-muted-foreground">
          记录日期
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="mt-1 block h-11 rounded-md border border-strong-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div>
          <span className="text-xs font-bold text-muted-foreground">录入方式</span>
          <div className="mt-1 inline-flex min-h-11 rounded-md border border-strong-border bg-white p-1">
            {(['by_student', 'by_subject'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onModeChange(value)}
                className={cn(
                  'min-h-11 rounded px-3 text-[13px] font-bold transition-colors',
                  mode === value ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {value === 'by_student' ? '按学生' : '按作业种类'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="sr-only">批量作业记录</span>
        <textarea
          value={raw}
          onChange={(event) => onRawChange(event.target.value)}
          rows={6}
          placeholder={
            mode === 'by_student'
              ? '每行一名学生，例如：\n卜一轩：英语粉书、数学\n吴辰轩：请假、英语'
              : '每行一种作业，例如：\n数学：卜一轩、张曦\n请假：卜一轩、吴辰轩'
          }
          className="w-full resize-y rounded-lg border border-strong-border bg-white px-3 py-3 font-mono text-[13px] leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {preview.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/35 p-3" aria-label="录入解析预览">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-foreground">解析预览 · {preview.length} 行</p>
            <p className={cn('text-xs font-bold', invalidCount ? 'text-warning-700' : 'text-success-700')}>
              {invalidCount ? `${invalidCount} 行缺少冒号，将由后端返回具体错误` : '格式检查通过'}
            </p>
          </div>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {preview.map((line, index) => (
              <div
                key={`${line.source}-${index}`}
                className={cn(
                  'flex min-h-11 items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-xs',
                  line.valid ? 'border-border' : 'border-warning-500/40'
                )}
              >
                <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-bold text-foreground">{line.left}</span>
                {line.valid && <span className="text-muted-foreground">→ {line.right || '（空）'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-lg border px-3 py-3 text-sm',
            feedback.tone === 'success' && 'border-success-500/30 bg-success-50 text-success-700',
            feedback.tone === 'partial' && 'border-warning-500/30 bg-warning-50 text-warning-700',
            feedback.tone === 'error' && 'border-danger-500/30 bg-danger-50 text-danger-700'
          )}
        >
          <div className="flex items-start gap-2 font-bold">
            {feedback.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{feedback.title}</span>
          </div>
          {feedback.details && feedback.details.length > 0 && (
            <ul className="mt-2 space-y-1 pl-6 text-xs">
              {feedback.details.map((detail, index) => <li key={`${detail}-${index}`}>{detail}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          `subject` 继续表示作业种类；请假等非作业关键词按特殊情况保存，不计作业缺交。
        </p>
        <Button className="min-h-11 shrink-0" onClick={onSubmit} disabled={submitting || !raw.trim()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? '正在录入' : '确认录入'}
        </Button>
      </div>
    </div>
  )
}
