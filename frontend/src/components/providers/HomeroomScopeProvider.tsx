'use client'

import * as React from 'react'

export interface TeacherInfo {
  id?: number
  name?: string | null
  target_class_high1?: number | null
  target_class_high2?: number | null
  target_class_high3?: number | null
  active_grade?: number | null
  has_pending_rollover?: boolean
}

export interface HomeroomScope {
  grade: 1 | 2 | 3
  classNum: number
  label: string
}

interface HomeroomScopeContextValue {
  teacher: TeacherInfo | null
  scopes: HomeroomScope[]
  activeScope: HomeroomScope | null
  loading: boolean
  switching: boolean
  error: string | null
  selectScope: (grade: HomeroomScope['grade']) => Promise<void>
  refreshTeacher: () => Promise<void>
  updateTeacherName: (name: string | null) => void
}

const HomeroomScopeContext = React.createContext<HomeroomScopeContextValue | null>(null)

function classNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildScopes(teacher: TeacherInfo | null): HomeroomScope[] {
  if (!teacher) return []
  const candidates: Array<[HomeroomScope['grade'], number | null]> = [
    [1, classNumber(teacher.target_class_high1)],
    [2, classNumber(teacher.target_class_high2)],
    [3, classNumber(teacher.target_class_high3)],
  ]
  return candidates.flatMap(([grade, classNum]) =>
    classNum == null ? [] : [{ grade, classNum, label: `高${grade} · ${classNum}班` }]
  )
}

async function responseDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail || '班级范围切换失败'
  } catch {
    return '班级范围切换失败'
  }
}

interface HomeroomScopeProviderProps {
  children: React.ReactNode
  reloadPage?: () => void
}

function defaultReloadPage() {
  window.location.reload()
}

export function HomeroomScopeProvider({
  children,
  reloadPage = defaultReloadPage,
}: HomeroomScopeProviderProps) {
  const [teacher, setTeacher] = React.useState<TeacherInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [switching, setSwitching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const requestId = React.useRef(0)

  const refreshTeacher = React.useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/teacher', { cache: 'no-store' })
      if (!response.ok) throw new Error('无法读取班主任配置')
      const data = (await response.json()) as TeacherInfo
      if (currentRequest === requestId.current) setTeacher(data)
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setTeacher(null)
        setError(cause instanceof Error ? cause.message : '无法读取班主任配置')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refreshTeacher()
  }, [refreshTeacher])

  const scopes = React.useMemo(() => buildScopes(teacher), [teacher])
  const activeScope = React.useMemo(
    () => scopes.find((scope) => scope.grade === teacher?.active_grade) ?? null,
    [scopes, teacher?.active_grade]
  )

  const selectScope = React.useCallback(
    async (grade: HomeroomScope['grade']) => {
      const nextScope = scopes.find((scope) => scope.grade === grade)
      if (!nextScope || nextScope.grade === activeScope?.grade) return

      setSwitching(true)
      setError(null)
      try {
        const response = await fetch('/api/rollover/active-grade', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade }),
        })
        if (!response.ok) throw new Error(await responseDetail(response))
        setTeacher((current) => (current ? { ...current, active_grade: grade } : current))
        // 部分尚未重构的旧页面只在挂载时读取作用域。整页刷新可立即取消旧请求，
        // 并确保所有既有路由在渐进迁移期间也不会继续展示上一个班级的数据。
        reloadPage()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '班级范围切换失败'
        setError(message)
        throw cause
      } finally {
        setSwitching(false)
      }
    },
    [activeScope?.grade, reloadPage, scopes]
  )

  const updateTeacherName = React.useCallback((name: string | null) => {
    setTeacher((current) => (current ? { ...current, name } : current))
  }, [])

  const value = React.useMemo<HomeroomScopeContextValue>(
    () => ({
      teacher,
      scopes,
      activeScope,
      loading,
      switching,
      error,
      selectScope,
      refreshTeacher,
      updateTeacherName,
    }),
    [teacher, scopes, activeScope, loading, switching, error, selectScope, refreshTeacher, updateTeacherName]
  )

  return <HomeroomScopeContext.Provider value={value}>{children}</HomeroomScopeContext.Provider>
}

export function useHomeroomScope(): HomeroomScopeContextValue {
  const context = React.useContext(HomeroomScopeContext)
  if (!context) throw new Error('useHomeroomScope must be used within HomeroomScopeProvider')
  return context
}
