'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  ClipboardList,
  Users,
  GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatClassLabel } from '@/lib/labels'

export interface TeacherSummary {
  name?: string | null
  current_class?: number | null
  current_grade?: number | null
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match: (pathname: string) => boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: '仪表盘',
    icon: LayoutDashboard,
    match: (p) => p === '/',
  },
  {
    href: '/upload',
    label: '数据上传',
    icon: Upload,
    match: (p) => p.startsWith('/upload'),
  },
  {
    href: '/compare',
    label: '班级对比',
    icon: BarChart3,
    match: (p) => p.startsWith('/compare'),
  },
  {
    href: '/exam',
    label: '考试列表',
    icon: ClipboardList,
    match: (p) => p.startsWith('/exam'),
  },
  {
    href: '/student',
    label: '学生检索',
    icon: Users,
    match: (p) => p.startsWith('/student'),
  },
]

export function SidebarContent({ teacher }: { teacher: TeacherSummary | null }) {
  const pathname = usePathname() || '/'
  const classLabel =
    formatClassLabel(teacher?.current_grade, teacher?.current_class) ?? '—'

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-5">
        <GraduationCap className="h-6 w-6 text-brand-500" />
        <span className="text-lg font-semibold tracking-tight">成绩追踪</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer card */}
      <div className="border-t border-slate-800 p-3">
        <div className="rounded-md bg-slate-800/60 px-3 py-3">
          <div className="text-xs text-slate-500">班主任</div>
          <div className="mt-0.5 text-sm font-medium text-slate-100">
            {teacher?.name || '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500">当前班级</div>
          <div className="mt-0.5 text-sm font-medium text-slate-100">{classLabel}</div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ teacher }: { teacher: TeacherSummary | null }) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-30">
      <SidebarContent teacher={teacher} />
    </aside>
  )
}
