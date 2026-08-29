'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Table as TableIcon,
  Upload,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { parseRosterText } from '@/lib/roster-parser'
import {
  buildDefaultDecisions,
  type AmbiguousCandidate as Candidate,
  type AmbiguousStudent as AmbiguousRow,
  type ConfirmBatchItemPayload,
  type ConfirmDecision,
} from '@/lib/rollover-batch'
import {
  AmbiguousBatchCard,
  BatchResultCard,
  type BatchResultData,
} from '@/components/rollover/AmbiguousBatchCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatePanel } from '@/components/patterns/StatePanel'
import { StepWizard } from '@/components/patterns/StepWizard'

// ─────────────────────────── 类型 ───────────────────────────

interface TeacherInfo {
  target_class_high1: number | null
  target_class_high2: number | null
  target_class_high3: number | null
  has_pending_rollover: boolean
  active_grade: number
}

interface PrevAlias {
  student_id: string
  grade: number
  class_num: number | null
}
interface InheritedRow {
  student_id: string
  name: string | null
  identity_id: number
  prev_aliases: PrevAlias[]
}
interface SimpleRow {
  student_id: string
  name: string | null
}
interface LeftClassRow {
  student_id: string
  name: string | null
  class_num: number
}
interface Preview {
  inherited: InheritedRow[]
  ambiguous: AmbiguousRow[]
  new: SimpleRow[]
  unmatched: SimpleRow[]
  left_class: LeftClassRow[]
  summary: {
    inherited: number
    ambiguous: number
    new: number
    unmatched: number
    left_class: number
  }
}

interface RosterResult {
  created: number
  updated: number
  replaced: number
  repaired: number
  total: number
}
interface CrosswalkResult {
  linked: number
  conflict: number
  skipped: number
}
interface ImportResult {
  identity_id: number | null
  imported: number
}

const DASH = '—'

async function requestJson<T>(url: string, init?: RequestInit, fallback = '操作失败'): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string | Array<{ msg?: string }>; message?: string }
      | null
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((d) => d?.msg ?? '').filter(Boolean).join('；')
      : body?.detail
    throw new Error(detail || body?.message || `${fallback}（HTTP ${response.status}）`)
  }
  return (await response.json()) as T
}

function displayError(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message && cause.message !== 'Failed to fetch') {
    return cause.message
  }
  return `${fallback}，请检查网络后重试`
}

const CLASS_NUMS = Array.from({ length: 30 }, (_, i) => i + 1)

// ─────────────────────────── 页面 ───────────────────────────

export default function RolloverWizardPage() {
  const { refreshTeacher } = useHomeroomScope()
  const [tab, setTab] = useState<'step1' | 'step2' | 'step3'>('step1')

  const [teacher, setTeacher] = useState<TeacherInfo | null>(null)
  const [teacherLoading, setTeacherLoading] = useState(true)
  const [teacherError, setTeacherError] = useState<string | null>(null)
  const [activeGrade, setActiveGrade] = useState<number | null>(null)

  // Step 1
  const [targetGrade, setTargetGrade] = useState<string>('2')
  const [classNum, setClassNum] = useState<string>('')
  const [bindMsg, setBindMsg] = useState<string | null>(null)
  const [rosterText, setRosterText] = useState('')
  const [rosterBusy, setRosterBusy] = useState(false)
  const [rosterMsg, setRosterMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Step 2
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [crosswalkOpen, setCrosswalkOpen] = useState(false)

  // Step 2 同名批量确认（行内选择 + 单事务提交 + 撤销本批）
  const [batchDecisions, setBatchDecisions] = useState<Record<string, ConfirmDecision>>({})
  const [batchResult, setBatchResult] = useState<BatchResultData | null>(null)
  const [batchUndone, setBatchUndone] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)

  // 目标范围（年级+班）代际号：范围一变自增，在途的旧响应/旧提交结果回来时
  // 对比代际后直接丢弃，防止慢响应把旧范围的数据盖到新范围上。
  const scopeGenRef = useRef(0)

  const loadTeacher = useCallback(async () => {
    setTeacherLoading(true)
    setTeacherError(null)
    try {
      const t = await requestJson<TeacherInfo>('/api/teacher', { cache: 'no-store' }, '班级配置加载失败')
      setTeacher(t)
      setActiveGrade(t.active_grade)
    } catch (cause) {
      setTeacherError(displayError(cause, '班级配置加载失败'))
    } finally {
      setTeacherLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTeacher().catch(() => {})
  }, [loadTeacher])

  // 当目标年级变化时，按 target_class_high{2/3} 预填班号
  useEffect(() => {
    if (!teacher) return
    const g = Number(targetGrade)
    const prefilled =
      g === 2 ? teacher.target_class_high2 : g === 3 ? teacher.target_class_high3 : null
    setClassNum(prefilled != null ? String(prefilled) : '')
  }, [targetGrade, teacher])

  const effectiveClassNum = useMemo(() => {
    const n = Number(classNum)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [classNum])

  // 当前预览班级是否恰为教师绑定的目标年级行政班（严格安全项的前提之一；
  // 服务端 confirm-batch 会按绑定重新校验，这里只用于前端默认勾选与提示）
  const boundClassMatch = useMemo(() => {
    if (!teacher || effectiveClassNum == null) return false
    const g = Number(targetGrade)
    const bound = g === 2 ? teacher.target_class_high2 : g === 3 ? teacher.target_class_high3 : null
    return bound != null && bound === effectiveClassNum
  }, [teacher, effectiveClassNum, targetGrade])

  // ─── Step 1 动作 ───
  async function bindClass() {
    if (effectiveClassNum == null) return
    setBindMsg(null)
    const g = Number(targetGrade)
    try {
      await requestJson('/api/teacher/bind-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_num: effectiveClassNum, grade: g }),
      }, '绑定失败')
      setBindMsg(`已绑定 高${g}（${effectiveClassNum} 班）`)
      await Promise.all([loadTeacher(), refreshTeacher()])
    } catch (cause) {
      setBindMsg(displayError(cause, '绑定失败'))
    }
  }

  // 解析逻辑在 @/lib/roster-parser（纯函数，供行为测试）：单列=姓名，两列=学号,姓名

  async function buildRosterFromScores() {
    if (effectiveClassNum == null) return
    setRosterBusy(true)
    setRosterMsg(null)
    try {
      const data = await requestJson<RosterResult>('/api/rollover/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_scores: true,
          grade: Number(targetGrade),
          class_num: effectiveClassNum,
        }),
      }, '派生名册失败')
      setRosterMsg({
        tone: 'ok',
        text: `已从成绩派生名册：新增 ${data.created}、更新 ${data.updated}、本班共 ${data.total} 人`,
      })
    } catch (cause) {
      setRosterMsg({ tone: 'error', text: displayError(cause, '派生名册失败') })
    } finally {
      setRosterBusy(false)
    }
  }

  async function buildRosterFromText() {
    if (effectiveClassNum == null) return
    const { rows, errors } = parseRosterText(rosterText)
    if (errors.length > 0) {
      setRosterMsg({ tone: 'error', text: errors.join('；') })
      return
    }
    if (rows.length === 0) {
      setRosterMsg({ tone: 'error', text: '请先粘贴学生：每行「学号,姓名」或单独「姓名」' })
      return
    }
    setRosterBusy(true)
    setRosterMsg(null)
    try {
      const data = await requestJson<RosterResult>('/api/rollover/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_scores: false,
          grade: Number(targetGrade),
          class_num: effectiveClassNum,
          rows: rows.map((r) => ({ student_id: r.student_id, name: r.name })),
        }),
      }, '写入名册失败')
      const parts = [
        `新增 ${data.created}`,
        `更新 ${data.updated}`,
        data.replaced > 0 ? `补学号 ${data.replaced}` : null,
        data.repaired > 0 ? `修复旧数据 ${data.repaired}` : null,
        `本班共 ${data.total} 人`,
      ].filter(Boolean)
      setRosterMsg({ tone: 'ok', text: `名册已写入：${parts.join('、')}` })
      setRosterText('')
    } catch (cause) {
      setRosterMsg({ tone: 'error', text: displayError(cause, '写入名册失败') })
    } finally {
      setRosterBusy(false)
    }
  }

  // ─── Step 2 动作 ───
  const loadPreview = useCallback(async () => {
    if (effectiveClassNum == null) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    const gen = scopeGenRef.current
    setPreviewBusy(true)
    setPreviewError(null)
    try {
      const response = await fetch(`/api/rollover/preview?grade=${Number(targetGrade)}&class_num=${effectiveClassNum}`, { cache: 'no-store' })
      if (gen !== scopeGenRef.current) return // 范围已切换，丢弃旧响应
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null
        throw new Error(body?.detail || `换届预览加载失败 (${response.status})`)
      }
      const data = (await response.json()) as Preview
      if (gen !== scopeGenRef.current) return
      setPreview(data)
    } catch (cause) {
      if (gen !== scopeGenRef.current) return
      setPreview(null)
      setPreviewError(displayError(cause, '换届预览加载失败'))
    } finally {
      if (gen === scopeGenRef.current) setPreviewBusy(false)
    }
  }, [effectiveClassNum, targetGrade])

  // 预览更新（提交成功 / 手动刷新 / 绑定变化）后按最新数据重置默认选择；
  // 提交失败不更新 preview，未提交的选择得以保留。
  useEffect(() => {
    if (preview) {
      setBatchDecisions(buildDefaultDecisions(preview.ambiguous, boundClassMatch))
    }
  }, [preview, boundClassMatch])

  // 目标范围（年级+班）变化时，清空旧范围的全部派生状态。仅在步骤间
  // 来回切换不清空批次结果，这样用户仍可返回第 2 步撤销刚才的确认。
  const scopeKey = `${Number(targetGrade)}-${effectiveClassNum ?? 'none'}`
  useEffect(() => {
    scopeGenRef.current += 1
    setPreview(null)
    setPreviewError(null)
    setBatchDecisions({})
    setBatchResult(null)
    setBatchUndone(false)
    setBatchBusy(false)
    setBatchError(null)
    setUndoBusy(false)
    setMsg(null)
  }, [scopeKey])

  // 进入第 2 步或目标范围变化后请求一次新预览；失败后不自动循环重试。
  useEffect(() => {
    if (tab !== 'step2' || effectiveClassNum == null) return
    loadPreview().catch(() => {})
  }, [tab, scopeKey])

  async function linkG1(g2_sid: string, g1_sid: string, name?: string | null) {
    setMsg(null)
    try {
      await requestJson('/api/rollover/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g2_student_id: g2_sid, g1_student_id: g1_sid, name: name ?? null, grade: Number(targetGrade) }),
      }, '关联失败')
      setMsg(`已关联 ${name ?? g2_sid} → 高${Number(targetGrade) - 1} ${g1_sid}`)
      await loadPreview()
    } catch (cause) {
      setMsg(displayError(cause, '关联失败'))
    }
  }

  async function submitConfirmBatch(items: ConfirmBatchItemPayload[]) {
    if (effectiveClassNum == null || items.length === 0) return
    const gen = scopeGenRef.current
    setBatchBusy(true)
    setBatchError(null)
    setMsg(null)
    try {
      const data = await requestJson<BatchResultData>('/api/rollover/confirm-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: Number(targetGrade),
          class_num: effectiveClassNum,
          items: items.map((it) => ({
            g2_student_id: it.g2_student_id,
            name: it.name,
            decision: it.decision,
            g1_student_id: it.decision === 'link' ? it.g1_student_id : null,
          })),
        }),
      }, '批量确认失败')
      if (gen !== scopeGenRef.current) return // 范围已切换：不显示旧范围的批次结果
      setBatchResult(data)
      setBatchUndone(false)
      setMsg(`同名批量确认完成：关联 ${data.linked} 人、新学生 ${data.new_students} 人`)
      await loadPreview()
    } catch (cause) {
      if (gen !== scopeGenRef.current) return
      // 整批被服务端拒绝：保留未提交的选择，修正后可直接重试
      setBatchError(displayError(cause, '批量确认失败'))
    } finally {
      if (gen === scopeGenRef.current) setBatchBusy(false)
    }
  }

  async function undoConfirmBatch() {
    if (!batchResult || undoBusy) return
    const gen = scopeGenRef.current
    setUndoBusy(true)
    try {
      await requestJson(`/api/rollover/confirm-batch/${batchResult.batch_id}/undo`, { method: 'POST' }, '撤销失败')
      if (gen !== scopeGenRef.current) return
      setBatchUndone(true)
      setMsg('已撤销本次确认：本批新增的关联已解除，此前已有的关联不受影响')
      await loadPreview()
    } catch (cause) {
      if (gen !== scopeGenRef.current) return
      setMsg(displayError(cause, '撤销失败'))
    } finally {
      if (gen === scopeGenRef.current) setUndoBusy(false)
    }
  }

  async function unlink(student_id: string) {
    if (!confirm(`解除 ${student_id} 的跨学年关联？`)) return
    setMsg(null)
    try {
      await requestJson(`/api/rollover/link/${student_id}`, { method: 'DELETE' }, '解除失败')
      setMsg(`已解除关联 ${student_id}`)
      await loadPreview()
    } catch (cause) {
      setMsg(displayError(cause, '解除失败'))
    }
  }

  // ─── Step 3 动作 ───
  async function switchActiveGrade() {
    if (activeGrade == null) return
    setMsg(null)
    try {
      await requestJson('/api/rollover/active-grade', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: activeGrade }),
      }, '切换失败')
      setMsg(`作业看板已切换到 高${activeGrade}`)
      await Promise.all([loadTeacher(), refreshTeacher()])
    } catch (cause) {
      setMsg(displayError(cause, '切换失败'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="升级换届向导"
        description="把上一学年的身份和作业名册平滑迁移到新年级；同名学生由你逐项核对，安全匹配可一键批量确认。"
        actions={<Button asChild variant="outline"><Link href="/"><ChevronLeft className="h-4 w-4" />返回仪表盘</Link></Button>}
      />

      {teacherLoading && <StatePanel tone="loading" title="正在读取班级与换届状态" />}
      {teacherError && <StatePanel tone="error" title="无法读取班级配置" description={teacherError} action={<Button variant="outline" onClick={loadTeacher}><RefreshCw className="h-4 w-4" />重试</Button>} />}

      {teacher?.has_pending_rollover && (
        <Card className="border-warning-500 bg-warning-50">
          <CardContent className="flex items-start gap-2 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-700" />
            <div className="text-sm text-warning-700">
              检测到已上传新年级成绩但尚未完成身份迁移。请按下面的三步把上一年级历史挂到新学号上，学生画像里的跨学年趋势才能连续。
            </div>
          </CardContent>
        </Card>
      )}

      {!teacherLoading && !teacherError && <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <Card className="p-4">
          <StepWizard
            steps={[
              { key: 'step1', title: '绑定与名册', description: '设定目标行政班' },
              { key: 'step2', title: '逐人判定', description: '确认身份接续' },
              { key: 'step3', title: '切换年级', description: '启用新学年看板' },
            ]}
            current={tab}
            completed={tab === 'step3' ? ['step1', 'step2'] : tab === 'step2' ? ['step1'] : []}
            onStepChange={(key) => setTab(key as typeof tab)}
          />
        </Card>

        {/* ───────────── Step 1 ───────────── */}
        <TabsContent value="step1" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">目标年级与行政班</CardTitle>
              <CardDescription>
                选择你要结转到的年级与班号。确认后会写入「我的班级」绑定（上一年级历史按此班号匹配）。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-36 space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">目标年级</label>
                  <Select value={targetGrade} onValueChange={setTargetGrade}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">高二</SelectItem>
                      <SelectItem value="3">高三</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">行政班</label>
                  <Select value={classNum} onValueChange={setClassNum}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择班号" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_NUMS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} 班
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={bindClass} disabled={effectiveClassNum == null}>
                  确认绑定
                </Button>
                {bindMsg && <span className="text-sm text-success-600">{bindMsg}</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">建作业花名册</CardTitle>
              <CardDescription>
                花名册是作业看板 / 缺交统计的基础。若已上传该班成绩，可一键派生；否则粘贴名单。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={buildRosterFromScores}
                  disabled={effectiveClassNum == null || rosterBusy}
                >
                  {rosterBusy ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  从该班成绩派生名册
                </Button>
                <span className="text-xs text-slate-400">（需先上传高{targetGrade} 学生分数表）</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-600">
                  或粘贴名单（每行一个：<code className="rounded bg-slate-100 px-1">学号,姓名</code> 或单独
                  <code className="ml-1 rounded bg-slate-100 px-1">姓名</code>
                  ；逗号 / 制表符 / 空格分隔均可）
                </label>
                <textarea
                  value={rosterText}
                  onChange={(e) => setRosterText(e.target.value)}
                  placeholder={'张三\n李四\n20250201,王五'}
                  rows={6}
                  className="w-full rounded-md border border-slate-200 p-2 font-mono text-sm text-base"
                />
                <p className="text-xs text-slate-400">
                  还没有学号？只粘姓名即可先建花名册、先记作业（学号显示为 TMP- 临时号）；
                  拿到正式学号后在同一个框再粘一次「学号,姓名」，作业与档案记录会自动跟到正式学号。
                </p>
                <div className="flex items-start gap-3">
                  <Button
                    variant="outline"
                    onClick={buildRosterFromText}
                    disabled={effectiveClassNum == null || rosterBusy}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    写入名册
                  </Button>
                  {rosterMsg && (
                    <span
                      role={rosterMsg.tone === 'error' ? 'alert' : 'status'}
                      className={cn(
                        'min-w-0 break-words text-sm',
                        rosterMsg.tone === 'ok' ? 'text-success-600' : 'text-danger-600',
                      )}
                    >
                      {rosterMsg.text}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button variant="ghost" onClick={() => setTab('step2')}>
                  下一步 · 逐人判定 →
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── Step 2 ───────────── */}
        <TabsContent value="step2" className="space-y-6">
          <PreviewStep
            preview={preview}
            busy={previewBusy}
            error={previewError}
            classNum={effectiveClassNum}
            grade={Number(targetGrade)}
            msg={msg}
            onLoad={loadPreview}
            onLink={linkG1}
            onUnlink={unlink}
            crosswalkOpen={crosswalkOpen}
            setCrosswalkOpen={setCrosswalkOpen}
            onCrosswalkDone={loadPreview}
            setMsg={setMsg}
            boundClassMatch={boundClassMatch}
            batchDecisions={batchDecisions}
            onBatchDecisionsChange={setBatchDecisions}
            batchResult={batchResult}
            batchUndone={batchUndone}
            batchBusy={batchBusy}
            batchError={batchError}
            undoBusy={undoBusy}
            onSubmitBatch={submitConfirmBatch}
            onUndoBatch={undoConfirmBatch}
          />
        </TabsContent>

        {/* ───────────── Step 3 ───────────── */}
        <TabsContent value="step3" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">切换作业看板年级</CardTitle>
              <CardDescription>
                作业看板、排行、预警只看「当前年级」。切换后，上一年级缺交仍在每个学生的画像里可见，但不再混入看板。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-40 space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">当前看板年级</label>
                  <Select
                    value={activeGrade != null ? String(activeGrade) : undefined}
                    onValueChange={(v) => setActiveGrade(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择年级" />
                    </SelectTrigger>
                    <SelectContent>
                      {teacher?.target_class_high1 != null && <SelectItem value="1">高一</SelectItem>}
                      {teacher?.target_class_high2 != null && <SelectItem value="2">高二</SelectItem>}
                      {teacher?.target_class_high3 != null && <SelectItem value="3">高三</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={switchActiveGrade}
                  disabled={
                    activeGrade == null ||
                    (activeGrade === 1 && teacher?.target_class_high1 == null) ||
                    (activeGrade === 2 && teacher?.target_class_high2 == null) ||
                    (activeGrade === 3 && teacher?.target_class_high3 == null)
                  }
                >
                  把作业看板切到高{activeGrade ?? DASH}
                </Button>
                {msg && <span className="text-sm text-success-600">{msg}</span>}
              </div>
              <p className="text-xs text-slate-400">
                当前服务端年级：
                <span className="ml-1 font-medium text-slate-600">
                  高{teacher?.active_grade ?? DASH}
                </span>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>}
    </div>
  )
}

// ─────────────────────────── Step 2 子组件 ───────────────────────────

interface PreviewStepProps {
  preview: Preview | null
  busy: boolean
  error: string | null
  classNum: number | null
  grade: number
  msg: string | null
  onLoad: () => void
  onLink: (g2_sid: string, g1_sid: string, name?: string | null) => void
  onUnlink: (student_id: string) => void
  crosswalkOpen: boolean
  setCrosswalkOpen: (v: boolean) => void
  onCrosswalkDone: () => void
  setMsg: (m: string | null) => void
  boundClassMatch: boolean
  batchDecisions: Record<string, ConfirmDecision>
  onBatchDecisionsChange: (d: Record<string, ConfirmDecision>) => void
  batchResult: BatchResultData | null
  batchUndone: boolean
  batchBusy: boolean
  batchError: string | null
  undoBusy: boolean
  onSubmitBatch: (items: ConfirmBatchItemPayload[]) => void
  onUndoBatch: () => void
}

function PreviewStep({
  preview,
  busy,
  error,
  classNum,
  grade,
  msg,
  onLoad,
  onLink,
  onUnlink,
  crosswalkOpen,
  setCrosswalkOpen,
  onCrosswalkDone,
  setMsg,
  boundClassMatch,
  batchDecisions,
  onBatchDecisionsChange,
  batchResult,
  batchUndone,
  batchBusy,
  batchError,
  undoBusy,
  onSubmitBatch,
  onUndoBatch,
}: PreviewStepProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">逐人判定</CardTitle>
              <CardDescription>
                按高{grade}
                {classNum != null ? ` ${classNum} 班` : ''} 的学生，分四类核对跨学年身份。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCrosswalkOpen(true)}>
                <Upload className="mr-1 h-4 w-4" />
                导入对照表
              </Button>
              <Button variant="outline" size="sm" onClick={onLoad} disabled={busy || classNum == null}>
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && <StatePanel tone="error" title="换届预览加载失败" description={error} action={<Button variant="outline" onClick={onLoad}><RefreshCw className="h-4 w-4" />重试</Button>} className="mb-3" />}
          {msg && <div className="text-sm text-success-600">{msg}</div>}
          {preview ? (
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <Badge variant="success">继承 {preview.summary.inherited}</Badge>
              <Badge variant="warning">同名待确认 {preview.summary.ambiguous}</Badge>
              <Badge className="border-transparent bg-brand-50 text-brand-700">新学生 {preview.summary.new}</Badge>
              <Badge variant="secondary">无成绩 {preview.summary.unmatched}</Badge>
              <Badge variant="outline">离班 {preview.summary.left_class}</Badge>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              {classNum == null ? '请先在 Step 1 选定班级。' : '点击「刷新」生成分类。'}
            </div>
          )}
        </CardContent>
      </Card>

      {batchResult && (
        <BatchResultCard
          result={batchResult}
          remainingCount={preview?.ambiguous.length ?? 0}
          undone={batchUndone}
          undoBusy={undoBusy}
          onUndo={onUndoBatch}
        />
      )}

      {preview && (
        <>
          {/* 继承 */}
          <BucketCard
            title="继承"
            tone="success"
            hint={`已关联到高${grade - 1}学号。可解除关联。`}
            count={preview.summary.inherited}
            empty="暂无继承学生"
            rows={preview.inherited.map((r) => ({
              key: r.student_id,
              student_id: r.student_id,
              name: r.name,
              extra:
                r.prev_aliases.length > 0
                  ? r.prev_aliases
                      .map((a) => `高${a.grade}${a.class_num ?? '-'}班·${a.student_id}`)
                      .join(' / ')
                  : null,
              actions: (
                <Button variant="ghost" size="sm" onClick={() => onUnlink(r.student_id)}>
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  解除关联
                </Button>
              ),
            }))}
          />

          {/* 同名待确认：行内批量确认（无弹窗） */}
          <AmbiguousBatchCard
            rows={preview.ambiguous}
            grade={grade}
            classNum={classNum}
            boundClassMatch={boundClassMatch}
            decisions={batchDecisions}
            onDecisionsChange={onBatchDecisionsChange}
            submitBusy={batchBusy}
            onSubmit={onSubmitBatch}
            submitError={batchError}
          />

          {/* 新学生 */}
          <NewBucket rows={preview.new} grade={grade} onLink={onLink} setMsg={setMsg} />

          {/* 无成绩 */}
          <BucketCard
            title="无成绩数据"
            tone="slate"
            hint={`花名册里有、但高${grade}暂无成绩。仅粘姓名导入的学生先用 TMP- 临时学号记作业；等成绩上传 / 正式学号补录后再次刷新即可。`}
            count={preview.summary.unmatched}
            empty="暂无"
            rows={preview.unmatched.map((r) => ({
              key: r.student_id,
              student_id: r.student_id,
              name: r.name,
              extra: r.student_id.startsWith('TMP-') ? '临时学号 · 待补正式学号' : null,
              actions: <span className="text-xs text-slate-400">可先记作业 · 等待成绩上传</span>,
            }))}
          />

          {/* 离班（仅提示） */}
          {preview.left_class.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  高{grade - 1}在班 · 高{grade}未见
                  <Badge variant="outline">{preview.summary.left_class}</Badge>
                </CardTitle>
                <CardDescription>
                  这些学生去年还在你的班，但本年未出现。可能是转班 / 转学，仅作提示，无需操作。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {preview.left_class.map((s) => (
                    <Badge key={s.student_id} variant="outline">
                      {s.name ?? s.student_id}
                      <span className="ml-1 text-slate-400">高{grade - 1}{s.class_num}班</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <CrosswalkDialog
        open={crosswalkOpen}
        grade={grade}
        onOpenChange={setCrosswalkOpen}
        onDone={onCrosswalkDone}
      />
    </>
  )
}

// ─── 通用桶卡片（桌面表 + 移动卡片） ───
interface BucketRow {
  key: string
  student_id: string
  name: string | null
  extra: string | null
  actions: React.ReactNode
}

function BucketCard({
  title,
  tone,
  hint,
  count,
  empty,
  rows,
}: {
  title: string
  tone: 'success' | 'warning' | 'brand' | 'slate'
  hint: string
  count: number
  empty: string
  rows: BucketRow[]
}) {
  const badge = {
    success: <Badge variant="success">继承</Badge>,
    warning: <Badge variant="warning">同名待确认</Badge>,
    brand: <Badge className="border-transparent bg-brand-50 text-brand-700">新学生</Badge>,
    slate: <Badge variant="secondary">无成绩</Badge>,
  }[tone]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {badge}
          <span className="text-sm font-normal text-slate-400">{count}</span>
        </CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">{empty}</div>
        ) : (
          <>
            {/* 桌面表格 */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>关联信息</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-slate-500">{r.student_id}</TableCell>
                      <TableCell className="font-medium">{r.name ?? DASH}</TableCell>
                      <TableCell className="text-slate-500">{r.extra ?? DASH}</TableCell>
                      <TableCell className="text-right">{r.actions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* 移动卡片 */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <div key={r.key} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name ?? DASH}</span>
                    {r.actions}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{r.student_id}</div>
                  {r.extra && <div className="mt-1 text-xs text-slate-500">{r.extra}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 新学生（导入上一年级成绩 / 手动关联） ───
function NewBucket({
  rows,
  grade,
  onLink,
  setMsg,
}: {
  rows: SimpleRow[]
  grade: number
  onLink: (g2_sid: string, g1_sid: string, name?: string | null) => void
  setMsg: (m: string | null) => void
}) {
  const [importFor, setImportFor] = useState<SimpleRow | null>(null)
  const [linkFor, setLinkFor] = useState<SimpleRow | null>(null)
  const [manualSid, setManualSid] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          新学生
          <Badge className="border-transparent bg-brand-50 text-brand-700">新学生</Badge>
          <span className="text-sm font-normal text-slate-400">{rows.length}</span>
        </CardTitle>
        <CardDescription>
          没有匹配到高{grade - 1}同名的学生。如确有历史，可手动关联学号或直接导入高{grade - 1}成绩。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">暂无新学生</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.student_id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-slate-500">{r.student_id}</TableCell>
                      <TableCell className="font-medium">{r.name ?? DASH}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setImportFor(r)}>
                            <Upload className="mr-1 h-3.5 w-3.5" />
                            导入高{grade - 1}成绩
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setLinkFor(r)}>
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            手动关联
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <div key={r.student_id} className="space-y-2 rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name ?? DASH}</span>
                  </div>
                  <div className="font-mono text-xs text-slate-500">{r.student_id}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportFor(r)}>
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      导入高{grade - 1}成绩
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setLinkFor(r)}>
                      <Link2 className="mr-1 h-3.5 w-3.5" />
                      手动关联
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <ImportHistoryDialog row={importFor} grade={grade} onOpenChange={(v) => !v && setImportFor(null)} setMsg={setMsg} />

      <Dialog open={linkFor != null} onOpenChange={(v) => !v && setLinkFor(null)}>
        <DialogContent className="max-sm:h-screen max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
          <DialogHeader>
            <DialogTitle>手动关联高{grade - 1}学号 · {linkFor?.name ?? ''}</DialogTitle>
            <DialogDescription>
              输入该生的高{grade - 1}学号，建立跨学年关联（用于连续跨学年趋势）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-slate-600">高{grade - 1}学号</label>
            <input
              value={manualSid}
              onChange={(e) => setManualSid(e.target.value)}
              placeholder={`高${grade - 1}学号`}
              className="w-full rounded-md border border-slate-200 p-2 text-base font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkFor(null)
                setManualSid('')
              }}
            >
              取消
            </Button>
            <Button
              disabled={!manualSid.trim() || linkFor == null}
              onClick={() => {
                if (linkFor) onLink(linkFor.student_id, manualSid.trim(), linkFor.name)
                setLinkFor(null)
                setManualSid('')
              }}
            >
              确认关联
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ImportHistoryDialog({
  row,
  grade,
  onOpenChange,
  setMsg,
}: {
  row: SimpleRow | null
  grade: number
  onOpenChange: (v: boolean) => void
  setMsg: (m: string | null) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (row) {
      setText('')
      setResult(null)
    }
  }, [row])

  // 每行：考试名,科目,原始分[,等级分][,年级百分位][,学籍排名]
  function parseRows(text: string) {
    const out: Record<string, unknown>[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split(/[,\t，\s]+/).map((s) => s.trim()).filter(Boolean)
      if (parts.length < 2) continue
      const [exam_label, subject, raw_score, grade_score, grade_percentile, xueji_rank] = parts
      out.push({
        exam_label,
        kind: 'subject',
        subject,
        raw_score: raw_score != null && raw_score !== '' ? Number(raw_score) : null,
        grade_score: grade_score != null && grade_score !== '' ? Number(grade_score) : null,
        grade_percentile:
          grade_percentile != null && grade_percentile !== '' ? Number(grade_percentile) : null,
        xueji_rank: xueji_rank != null && xueji_rank !== '' ? Number(xueji_rank) : null,
        grade: grade - 1,
      })
    }
    return out
  }

  async function submit() {
    if (!row) return
    const rows = parseRows(text)
    if (rows.length === 0) {
      setResult(null)
      setMsg('请先粘贴成绩行')
      return
    }
    setBusy(true)
    try {
      const data = await requestJson<ImportResult>('/api/rollover/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: row.student_id, name: row.name, target_grade: grade, rows }),
      }, '导入失败')
      setResult(data)
      setMsg(`已导入 ${data.imported} 条高${grade - 1}成绩`)
    } catch (cause) {
      setMsg(displayError(cause, '导入失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={row != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-sm:h-screen max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
        <DialogHeader>
          <DialogTitle>导入高{grade - 1}成绩 · {row?.name ?? ''}</DialogTitle>
          <DialogDescription>
            把该生的高{grade - 1}历史成绩粘贴进来，建立身份并写入。导入后该生自动从「新学生」移到「继承」。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm text-slate-600">
            每行一条：<code className="rounded bg-slate-100 px-1">考试名,科目,原始分,等级分,年级百分位,学籍排名</code>（后三项可省）
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'期中,语文,98\n期中,数学,85'}
            rows={7}
            className="w-full rounded-md border border-slate-200 p-2 font-mono text-sm text-base"
          />
        </div>
        {result && (
          <div className="flex items-center gap-2 text-sm text-success-600">
            <CheckCircle2 className="h-4 w-4" />
            导入完成：{result.imported} 条
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={submit} disabled={busy || row == null}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 导入对照表（批量 link） ───
function CrosswalkDialog({
  open,
  grade,
  onOpenChange,
  onDone,
}: {
  open: boolean
  grade: number
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CrosswalkResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setText('')
      setResult(null)
      setError(null)
    }
  }, [open])

  // 每行：上一年级学号,目标年级学号[,姓名]
  function parseRows(text: string) {
    const out: { g1_sid: string; g2_sid: string; name?: string }[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split(/[,\t，\s]+/).map((s) => s.trim()).filter(Boolean)
      if (parts.length < 2) continue
      out.push({ g1_sid: parts[0], g2_sid: parts[1], name: parts[2] || undefined })
    }
    return out
  }

  async function submit() {
    const rows = parseRows(text)
    if (rows.length === 0) {
      setResult(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await requestJson<CrosswalkResult>('/api/rollover/crosswalk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, target_grade: grade }),
      }, '导入对照表失败')
      setResult(data)
      onDone()
    } catch (cause) {
      setResult(null)
      setError(displayError(cause, '导入对照表失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-sm:h-screen max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5" />
            导入对照表（批量关联）
          </DialogTitle>
          <DialogDescription>
            把高{grade - 1}学号与高{grade}学号成对粘贴，一次批量建立关联。冲突 / 跳过会在下方提示。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm text-slate-600">
            每行一对：<code className="rounded bg-slate-100 px-1">高{grade - 1}学号,高{grade}学号[,姓名]</code>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'20240101,20250201,张三\n20240102,20250202,李四'}
            rows={8}
            className="w-full rounded-md border border-slate-200 p-2 font-mono text-sm text-base"
          />
        </div>
        {result && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-success-600">
              <CheckCircle2 className="h-4 w-4" />
              关联 {result.linked}
            </span>
            {result.conflict > 0 && (
              <span className="inline-flex items-center gap-1 text-warning-700">
                <AlertTriangle className="h-4 w-4" />
                冲突 {result.conflict}（学号已关联到别人，未合并）
              </span>
            )}
            {result.skipped > 0 && (
              <span className="text-slate-500">跳过 {result.skipped}（已是同一身份）</span>
            )}
          </div>
        )}
        {error && <StatePanel tone="error" title="导入对照表失败" description={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            导入对照表
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
