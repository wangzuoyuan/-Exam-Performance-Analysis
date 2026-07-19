'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Printer } from 'lucide-react'

import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'

const DASH = '—'

interface MainTrendPoint {
  exam_name: string
  exam_date?: string | null
  total_score?: number | null
  xueji_rank?: number | null
}
interface SubjectTrendPoint {
  exam_name: string
  exam_date?: string | null
  subject: string
  raw_score?: number | null
  grade_percentile?: number | null
}
interface StudentProfile {
  student_id: string
  name: string
  class_num?: number | null
  main_total_trend: MainTrendPoint[]
  subject_trend: SubjectTrendPoint[]
}
interface StudentScopeSummary {
  student_id: string
  current_grade?: number | null
  class_num?: number | null
}
interface HomeworkSummary {
  total_misses?: number
  miss_by_subject?: Record<string, number>
  special_counts?: Record<string, number>
  error?: string
}
interface Note {
  id: number
  date: string
  category: string
  content: string
}

const ALL_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理']

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

export default function StudentReportPage() {
  const params = useParams<{ id: string }>()
  const studentId = Array.isArray(params?.id) ? params?.id[0] : params?.id
  const { activeScope, loading: scopeLoading, error: scopeError } = useHomeroomScope()

  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [homework, setHomework] = useState<HomeworkSummary | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [homeworkError, setHomeworkError] = useState<string | null>(null)
  const [notesError, setNotesError] = useState<string | null>(null)

  useEffect(() => {
    if (scopeLoading) return
    if (!studentId || !activeScope) {
      setProfile(null)
      setLoading(false)
      setError(scopeError || '请先绑定并选择行政班')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setHomeworkError(null)
    setNotesError(null)
    setProfile(null)

    async function loadReport() {
      try {
        const listResponse = await fetch('/api/students', { cache: 'no-store', signal: controller.signal })
        if (!listResponse.ok) throw new Error('无法验证学生所属班级')
        const students = (await listResponse.json()) as StudentScopeSummary[]
        const authorized = students.some(
          (student) =>
            student.student_id === studentId &&
            student.current_grade === activeScope!.grade &&
            student.class_num === activeScope!.classNum
        )
        if (!authorized) throw new Error('该学生不属于当前班级，无法生成家长会一页纸')

        const profileResponse = await fetch(`/api/students/${studentId}`, { cache: 'no-store', signal: controller.signal })
        if (!profileResponse.ok) throw new Error('无法读取学生报告')
        const profileData = (await profileResponse.json()) as StudentProfile
        const [homeworkResult, notesResult] = await Promise.allSettled([
          fetch(`/api/homework/student/${studentId}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
            if (!response.ok) throw new Error('作业记录读取失败')
            return (await response.json()) as HomeworkSummary
          }),
          fetch(`/api/notes/${studentId}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
            if (!response.ok) throw new Error('成长档案读取失败')
            return (await response.json()) as Note[]
          }),
        ])
        if (controller.signal.aborted) return
        setProfile(profileData)
        if (homeworkResult.status === 'fulfilled' && !homeworkResult.value.error) {
          setHomework(homeworkResult.value)
        } else {
          setHomework(null)
          setHomeworkError(
            homeworkResult.status === 'rejected'
              ? homeworkResult.reason instanceof Error ? homeworkResult.reason.message : '作业记录读取失败'
              : homeworkResult.value.error || '作业记录读取失败'
          )
        }
        if (notesResult.status === 'fulfilled' && Array.isArray(notesResult.value)) {
          setNotes(notesResult.value)
        } else {
          setNotes([])
          setNotesError(
            notesResult.status === 'rejected' && notesResult.reason instanceof Error
              ? notesResult.reason.message
              : '成长档案读取失败'
          )
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '无法读取学生报告')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadReport()
    return () => controller.abort()
  }, [activeScope, scopeError, scopeLoading, studentId])

  if (scopeLoading || loading) {
    return <div className="p-8 text-sm text-muted-foreground" role="status">正在生成学生报告…</div>
  }

  if (error || !profile) {
    return <div className="m-6 rounded-lg border border-danger-500/30 bg-danger-50 p-6 text-sm text-danger-700" role="alert">{error || '未找到该学生'}</div>
  }

  const mainTrend = [...(profile.main_total_trend || [])].sort((a, b) =>
    (a.exam_date ?? '') < (b.exam_date ?? '') ? -1 : 1
  )
  const reportMainTrend = mainTrend.slice(-6)
  const latestMain = mainTrend[mainTrend.length - 1]
  const firstMain = mainTrend[0]

  // 各科最新百分位
  const subjectLatest: Record<string, SubjectTrendPoint | undefined> = {}
  for (const s of profile.subject_trend || []) {
    if (num(s.raw_score) === null) continue
    const prev = subjectLatest[s.subject]
    if (!prev || (s.exam_date ?? '') >= (prev.exam_date ?? '')) subjectLatest[s.subject] = s
  }

  const hwSubjects = Object.entries(homework?.miss_by_subject || {})
  const hwSpecials = Object.entries(homework?.special_counts || {})

  return (
    <div className="mx-auto max-w-3xl space-y-5 bg-white p-6 text-slate-900 print:space-y-3 print:p-0 print:text-[11px] print:leading-tight">
      <style jsx global>{`
        @media print {
          html,
          body {
            min-height: 0 !important;
            height: auto !important;
          }
        }
      `}</style>
      {/* 顶部操作（打印时隐藏） */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/student/${studentId}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          返回学生页
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-bold text-white hover:bg-brand-700"
        >
          <Printer className="h-4 w-4" />
          打印 / 存为 PDF
        </button>
      </div>

      {/* 抬头 */}
      <div className="border-b border-slate-300 pb-3 print:pb-2">
        <h1 className="text-xl font-bold">家长会学生情况表</h1>
        <p className="mt-1 text-sm text-slate-600">
          {profile.name} · 学号 {profile.student_id}
          {profile.class_num != null ? ` · ${profile.class_num}班` : ''}
          <span className="ml-3 text-slate-400">生成日期 {new Date().toISOString().slice(0, 10)}</span>
        </p>
      </div>

      {/* 成绩概况 */}
      <section className="break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold">一、成绩概况（主三门）</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 font-normal">考试</th>
              <th className="py-1.5 font-normal text-right">三门总分</th>
              <th className="py-1.5 font-normal text-right">学籍排名</th>
            </tr>
          </thead>
          <tbody>
            {reportMainTrend.map((p, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5">{p.exam_name}</td>
                <td className="py-1.5 text-right tabular-nums">{num(p.total_score) ?? DASH}</td>
                <td className="py-1.5 text-right tabular-nums">{num(p.xueji_rank) ?? DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {latestMain && firstMain && num(latestMain.xueji_rank) !== null && num(firstMain.xueji_rank) !== null && (
          <p className="mt-2 text-sm text-slate-600">
            学籍排名从 {num(firstMain.xueji_rank)} 变化到 {num(latestMain.xueji_rank)}
            （{(num(firstMain.xueji_rank)! - num(latestMain.xueji_rank)!) >= 0 ? '前进' : '后退'}{' '}
            {Math.abs(num(firstMain.xueji_rank)! - num(latestMain.xueji_rank)!)} 名）。
          </p>
        )}
      </section>

      {/* 各科最新 */}
      <section className="break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold">二、各科最新水平（年级百分位，越小越靠前）</h2>
        <div className="grid grid-cols-3 gap-2 text-sm print:gap-1 print:text-[10px]">
          {ALL_SUBJECTS.map((sub) => {
            const s = subjectLatest[sub]
            const pct = s ? num(s.grade_percentile) : null
            return (
              <div key={sub} className="rounded border border-slate-200 px-2 py-1.5">
                <span className="font-medium">{sub}</span>{' '}
                <span className="text-slate-500">
                  {s && num(s.raw_score) !== null ? `${num(s.raw_score)}分` : DASH}
                  {pct !== null ? ` · ${Math.round(pct * 100)}%` : ''}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* 作业 */}
      <section className="break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold">三、作业完成情况（本学期缺交）</h2>
        {homeworkError ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            作业数据暂不可用：{homeworkError}
          </p>
        ) : homework ? (
          <p className="text-sm text-slate-700">
            共缺交 <span className="font-semibold">{homework.total_misses ?? 0}</span> 次
            {hwSpecials.length > 0 && `；${hwSpecials.map(([t, c]) => `${t}${c}次`).join('、')}`}
            {hwSubjects.length > 0 && (
              <span className="text-slate-500">
                （{hwSubjects.map(([s, c]) => `${s}${c}`).join('、')}）
              </span>
            )}
            。<span className="text-slate-400">注：仅含缺交/请假/迟到，不代表完成质量。</span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">无作业记录</p>
        )}
      </section>

      {/* 谈话摘要 */}
      <section className="break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold">四、近期沟通摘要</h2>
        {notesError ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            成长档案暂不可用：{notesError}
          </p>
        ) : notes.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {notes.slice(0, 4).map((n) => (
              <li key={n.id} className="text-slate-700">
                <span className="text-slate-400">{n.date}</span>{' '}
                <span className="font-medium">[{n.category}]</span> {n.content}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">暂无记录</p>
        )}
      </section>

      <div className="break-inside-avoid border-t border-slate-300 pt-3 text-xs text-slate-400 print:pt-2 print:text-[9px]">
        本表由成绩分析（班主任版）生成，仅供家校沟通参考。
      </div>
    </div>
  )
}
