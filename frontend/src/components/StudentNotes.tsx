'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, MessageSquarePlus, RefreshCw, Trash2 } from 'lucide-react'

import { SectionCard } from '@/components/patterns/SectionCard'
import { StatePanel } from '@/components/patterns/StatePanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Note {
  id: number
  date: string
  category: string
  content: string
  follow_up: string | null
  follow_up_done: boolean
}

type LoadState = 'loading' | 'ready' | 'error'

const CATEGORIES = ['谈话', '观察', '家访', '家长沟通', '奖惩', '其他']

const CATEGORY_STYLE: Record<string, string> = {
  谈话: 'bg-brand-50 text-brand-700',
  观察: 'bg-secondary text-muted-foreground',
  家访: 'bg-success-50 text-success-700',
  家长沟通: 'bg-warning-50 text-warning-700',
  奖惩: 'bg-danger-50 text-danger-700',
  其他: 'bg-secondary text-muted-foreground',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function StudentNotes({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [category, setCategory] = useState('谈话')
  const [content, setContent] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!studentId) return
    const controller = new AbortController()
    setState('loading')
    setError(null)
    fetch(`/api/notes/${studentId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('档案记录加载失败')
        return response.json()
      })
      .then((data) => {
        setNotes(Array.isArray(data) ? data : [])
        setState('ready')
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '档案记录加载失败')
        setState('error')
      })
    return () => controller.abort()
  }, [reloadKey, studentId])

  async function save() {
    if (!content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, date, category, content, follow_up: followUp || null }),
      })
      if (!response.ok) throw new Error('保存档案失败')
      setContent('')
      setFollowUp('')
      setShowForm(false)
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存档案失败')
    } finally {
      setSaving(false)
    }
  }

  async function toggleFollowUp(note: Note) {
    setError(null)
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follow_up_done: !note.follow_up_done }),
      })
      if (!response.ok) throw new Error('跟进状态更新失败')
      reload()
    } catch {
      setError('跟进状态更新失败，请检查网络后重试')
    }
  }

  async function remove(note: Note) {
    if (!confirm('删除这条档案记录？')) return
    setError(null)
    try {
      const response = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('删除档案失败')
      reload()
    } catch {
      setError('删除档案失败，请检查网络后重试')
    }
  }

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-primary" />成长与沟通档案</span>}
      description="谈话、观察、家访、家长沟通、奖惩与后续跟进"
      action={<Button variant="outline" onClick={() => setShowForm((value) => !value)}>{showForm ? '取消新增' : '新增记录'}</Button>}
    >
      {error && <div className="mb-3 rounded-lg border border-danger-500/25 bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">{error}</div>}

      {showForm && (
        <div className="mb-4 space-y-3 rounded-lg border border-strong-border bg-secondary/25 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="档案日期" className="sm:w-44" />
            <div className="flex flex-wrap gap-1.5" aria-label="档案类别">
              {CATEGORIES.map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={cn('min-h-11 rounded-md px-3 text-xs font-bold', category === item ? 'bg-primary text-primary-foreground' : 'border border-border bg-white text-muted-foreground hover:border-strong-border')}>{item}</button>
              ))}
            </div>
          </div>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder="记录谈话内容、观察或家校沟通情况…" aria-label="档案内容" className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <Input value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="跟进事项（可写日期，例如：7月25日前再谈一次）" aria-label="跟进事项" />
          <div className="flex justify-end"><Button onClick={save} disabled={saving || !content.trim()}>{saving ? '保存中…' : '保存记录'}</Button></div>
        </div>
      )}

      {state === 'loading' ? (
        <StatePanel tone="loading" title="正在读取成长档案" className="border-0 bg-transparent py-8" />
      ) : state === 'error' ? (
        <StatePanel tone="error" title="档案记录加载失败" action={<Button variant="outline" onClick={reload}><RefreshCw className="h-4 w-4" />重试</Button>} className="border-0 bg-transparent py-8" />
      ) : notes.length === 0 ? (
        <StatePanel tone="empty" title="暂无成长档案" description="新增记录后，可在这里持续完成跟进闭环。" className="border-0 bg-transparent py-8" />
      ) : (
        <div className="divide-y divide-border">
          {notes.map((note) => (
            <article key={note.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2"><Badge className={cn('border-transparent', CATEGORY_STYLE[note.category] || CATEGORY_STYLE.其他)}>{note.category}</Badge><time className="text-xs text-muted-foreground">{note.date}</time></div>
                <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-danger-600" onClick={() => remove(note)} aria-label="删除档案记录"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{note.content}</p>
              {note.follow_up && (
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 text-sm">
                  <input type="checkbox" checked={note.follow_up_done} onChange={() => toggleFollowUp(note)} className="h-5 w-5 rounded border-strong-border text-primary focus:ring-ring" />
                  <span className={cn('flex-1', note.follow_up_done ? 'text-muted-foreground line-through' : 'font-semibold text-warning-700')}>跟进：{note.follow_up}</span>
                  {note.follow_up_done && <CheckCircle2 className="h-4 w-4 text-success-600" />}
                </label>
              )}
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
