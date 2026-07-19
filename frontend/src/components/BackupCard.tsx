'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, DatabaseBackup, Download, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/patterns/SectionCard'

interface BackupItem {
  filename: string
  size: number
  created: string
}

type Message = { tone: 'success' | 'error'; text: string } | null

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function BackupCard() {
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<Message>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/backups', { cache: 'no-store' })
    if (!response.ok) throw new Error('备份列表加载失败')
    const data = (await response.json()) as unknown
    setBackups(Array.isArray(data) ? (data as BackupItem[]) : [])
  }, [])

  useEffect(() => {
    load()
      .catch(() => setMessage({ tone: 'error', text: '暂时无法读取备份列表。' }))
      .finally(() => setLoading(false))
  }, [load])

  async function backup() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/backup', { method: 'POST' })
      const data = (await response.json()) as { success?: boolean; filename?: string; detail?: string }
      if (!response.ok || !data.success) throw new Error(data.detail || '备份失败')
      setMessage({ tone: 'success', text: `已备份：${data.filename}` })
      await load()
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : '备份失败' })
    } finally {
      setBusy(false)
    }
  }

  async function restore(filename: string) {
    if (!confirm(`确定用「${filename}」覆盖当前数据库吗？\n恢复前会自动创建保护性备份。`)) return

    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = (await response.json()) as { success?: boolean; detail?: string }
      if (!response.ok || !data.success) throw new Error(data.detail || '恢复失败')
      setMessage({ tone: 'success', text: '已恢复，请重启应用使数据完全生效。' })
      await load()
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : '恢复失败' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4 text-primary" />
          数据备份
        </span>
      }
      description="恢复前会自动创建保护性备份，最近记录保存在本机。"
      action={
        <Button size="sm" className="min-h-11" onClick={backup} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
          立即备份
        </Button>
      }
    >
      {message && (
        <div
          className={message.tone === 'success' ? 'mb-3 flex items-center gap-2 text-sm text-success-600' : 'mb-3 flex items-center gap-2 text-sm text-danger-600'}
          role="status"
        >
          {message.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="py-3 text-sm text-muted-foreground">正在读取备份记录…</p>
      ) : backups.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">暂无备份，建议在首次导入后创建一份。</p>
      ) : (
        <div className="divide-y divide-border">
          {backups.slice(0, 4).map((item, index) => (
            <div key={item.filename} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-foreground">{item.filename}</span>
                  {index === 0 && <Badge variant="secondary">最新</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {item.created.replace('T', ' ')} · {fmtSize(item.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="icon" className="h-11 w-11" aria-label={`下载 ${item.filename}`}>
                  <a href={`/api/backup/${item.filename}/download`}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() => restore(item.filename)}
                  disabled={busy}
                >
                  <RotateCcw className="h-4 w-4" />
                  恢复
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
