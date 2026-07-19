'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import {
  BarChart3,
  Check,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Pencil,
  RefreshCw,
  School,
  Upload,
  Users,
  X,
} from 'lucide-react'

import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  match: (pathname: string) => boolean
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '工作台',
    items: [
      { href: '/', label: '仪表盘', icon: LayoutDashboard, match: (p) => p === '/' },
      { href: '/upload', label: '数据上传', icon: Upload, match: (p) => p.startsWith('/upload') },
    ],
  },
  {
    label: '成绩分析',
    items: [
      { href: '/exam', label: '考试列表', icon: ClipboardList, match: (p) => p.startsWith('/exam') },
      { href: '/compare', label: '班级对比', icon: BarChart3, match: (p) => p.startsWith('/compare') },
      { href: '/student', label: '学生检索', icon: Users, match: (p) => p.startsWith('/student') },
    ],
  },
  {
    label: '班级管理',
    items: [
      { href: '/homework', label: '作业跟踪', icon: NotebookPen, match: (p) => p.startsWith('/homework') },
      { href: '/settings/rollover', label: '升级换届', icon: RefreshCw, match: (p) => p.startsWith('/settings/rollover') },
    ],
  },
]

interface SidebarContentProps {
  onNavigate?: () => void
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname() || '/'
  const { teacher, activeScope, scopes, updateTeacherName } = useHomeroomScope()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(teacher?.name ?? '')
    setEditing(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commitEdit() {
    const name = draft.trim()
    setSaving(true)
    try {
      const response = await fetch('/api/teacher', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (response.ok) {
        updateTeacherName(name || null)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-white text-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="whitespace-nowrap text-[13px] font-extrabold tracking-[-0.02em]">成绩分析（班主任版）</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Homeroom Desk</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="主导航">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-5')}>
            <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.match(pathname)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      active
                        ? 'border-brand-500/20 bg-brand-50 text-brand-700'
                        : 'border-transparent text-muted-foreground hover:bg-muted/65 hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-[17px] w-[17px] shrink-0', active ? 'text-brand-600' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-background px-3.5 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">班主任</div>
              {editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitEdit()
                    if (event.key === 'Escape') setEditing(false)
                  }}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
                  placeholder="输入姓名"
                  maxLength={20}
                  disabled={saving}
                />
              ) : (
                <div className="mt-0.5 truncate text-sm font-extrabold">{teacher?.name || '未填写姓名'}</div>
              )}
            </div>
            {editing ? (
              <div className="flex shrink-0 gap-1">
                <button onClick={() => void commitEdit()} disabled={saving} className="grid h-11 w-11 place-items-center rounded-md text-success-600 hover:bg-success-50" aria-label="保存姓名">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditing(false)} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="取消编辑">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={startEdit} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white hover:text-foreground" aria-label="编辑姓名">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-warning-50 text-accent-foreground">
              <School className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-muted-foreground">当前范围</div>
              <div className="truncate text-xs font-extrabold">
                {activeScope?.label ?? (scopes.length ? '请选择已绑定班级' : '尚未绑定班级')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col lg:flex print:hidden">
      <SidebarContent />
    </aside>
  )
}
