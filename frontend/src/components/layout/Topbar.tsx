'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Menu, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ScopeSelect } from '@/components/patterns/ScopeSelect'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SidebarContent } from './Sidebar'

const SEGMENT_LABELS: Record<string, string> = {
  '': '仪表盘',
  upload: '数据上传',
  compare: '班级对比',
  exam: '考试列表',
  student: '学生检索',
  homework: '作业跟踪',
  manage: '记录管理',
  warnings: '缺交预警',
  correlation: '缺交与成绩',
  settings: '系统设置',
  rollover: '升级换届',
  report: '家长会一页纸',
}

interface Crumb {
  label: string
  href?: string
}

function buildCrumbs(pathname: string, dynamicLabels: Record<string, string> = {}): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return [{ label: '仪表盘' }]

  const crumbs: Crumb[] = []
  let accumulated = ''
  segments.forEach((segment, index) => {
    accumulated += `/${segment}`
    const dynamicId = index > 0 && /^[\w-]+$/.test(segment) && SEGMENT_LABELS[segment] === undefined
    let displaySegment = segment
    try {
      displaySegment = decodeURIComponent(segment)
    } catch {
      // 路径段包含未转义特殊字符时保持原样，避免页面因 decode 失败崩溃。
    }
    let label = SEGMENT_LABELS[segment] ?? displaySegment
    if (dynamicId) {
      label = dynamicLabels[accumulated] || `#${segment}`
      if (!dynamicLabels[accumulated] && segments[index - 1] === 'exam') label = `考试 #${segment}`
      if (!dynamicLabels[accumulated] && segments[index - 1] === 'student') label = `学生 #${segment}`
    }
    const hasRealParentRoute = accumulated !== '/settings'
    crumbs.push({
      label,
      href: index === segments.length - 1 || !hasRealParentRoute ? undefined : accumulated,
    })
  })
  return crumbs
}

export function Topbar() {
  const pathname = usePathname() || '/'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({})
  const crumbs = buildCrumbs(pathname, dynamicLabels)

  useEffect(() => {
    setMobileOpen(false)
    const match = pathname.match(/^\/exam\/(\d+)/)
    if (!match) {
      setDynamicLabels({})
      return
    }
    let cancelled = false
    const href = `/exam/${match[1]}`
    fetch(`/api/exams/${match[1]}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setDynamicLabels(data?.exam?.name ? { [href]: data.exam.name } : {})
      })
      .catch(() => {
        if (!cancelled) setDynamicLabels({})
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  function openChat() {
    window.dispatchEvent(new CustomEvent('open-chat'))
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur print:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-5 lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" aria-label="打开主导航">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[272px] border-0 p-0 [&>button]:right-3 [&>button]:top-3">
              <SheetTitle className="sr-only">主导航</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <nav className="flex min-w-0 items-center gap-1 text-xs sm:text-sm" aria-label="面包屑">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hidden min-h-11 min-w-11 items-center justify-center truncate px-2 font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="max-w-[48vw] truncate font-extrabold text-foreground sm:max-w-[36vw]">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <ScopeSelect compact />
          </div>
          <Button variant="ghost" size="icon" onClick={openChat} className="h-11 w-11 text-brand-700" aria-label="打开 AI 对话助手" title="AI 对话助手">
            <MessageSquare className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-12 items-center gap-2 border-t border-warning-500/15 bg-[#fbf4ea] px-3 sm:hidden">
        <span className="shrink-0 text-[11px] font-extrabold text-accent-foreground">当前班级</span>
        <ScopeSelect className="flex-1" />
      </div>
    </header>
  )
}
