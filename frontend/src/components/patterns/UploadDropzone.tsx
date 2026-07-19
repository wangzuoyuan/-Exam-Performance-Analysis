'use client'

import { useRef, useState, type DragEvent } from 'react'
import { UploadCloud } from 'lucide-react'

import { cn } from '@/lib/utils'

export function UploadDropzone({
  onFiles,
  accept = '.xlsx',
  multiple = true,
  disabled = false,
  title = '拖入 Excel 文件，或点击选择文件',
  description = '仅支持 .xlsx，可多选',
}: {
  onFiles: (files: FileList) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  title?: string
  description?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    if (!disabled && event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cn('flex min-h-44 w-full flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60', dragging ? 'border-primary bg-brand-50' : 'border-strong-border bg-secondary/20 hover:border-primary hover:bg-brand-50/60')}
    >
      <UploadCloud className={cn('h-10 w-10', dragging ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="mt-3 text-sm font-extrabold text-foreground">{title}</span>
      <span className="mt-1 text-xs text-muted-foreground">{description}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </button>
  )
}
