'use client'

// 学生管理对话框集合：新增 / 编辑 / 学号管理 / 删除（含影响预览）/ 合并。
// 所有写操作不带任何班级参数——作用域由后端强制为教师当前绑定班级。

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHomeroomScope } from '@/components/providers/HomeroomScopeProvider'
import {
  countsToText,
  type DeletePreview,
  type ManageStudent,
  type MergePreview,
} from '@/lib/student-management'

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    let message = '操作失败，请重试'
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
      else if (body.detail && typeof body.detail === 'object') {
        const payload = body.detail as { message?: string; requires_confirm?: boolean }
        message = payload.message ?? message
      }
    } catch {
      /* keep default message */
    }
    throw new Error(message)
  }
  return response.json()
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-bold text-muted-foreground">
      {children}
    </label>
  )
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs font-bold text-danger-600">
      {message}
    </p>
  )
}

// ─────────────────────────── 新增学生 ───────────────────────────

interface AddStudentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export function AddStudentDialog({ open, onOpenChange, onDone }: AddStudentDialogProps) {
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [gender, setGender] = useState('')
  const [seatNo, setSeatNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setName('')
      setStudentId('')
      setGender('')
      setSeatNo('')
      setError(null)
    }
  }, [open])

  async function submit() {
    if (!name.trim()) {
      setError('姓名不能为空')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await requestJson('/api/manage/students', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          student_id: studentId.trim() || null,
          gender: gender.trim() || null,
          seat_no: seatNo.trim() === '' ? null : Number(seatNo),
        }),
      })
      onOpenChange(false)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增学生</DialogTitle>
          <DialogDescription>
            写入当前班级花名册并建立跨学年主档；不填学号时先生成临时学号，拿到正式学号后可随时补录。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="add-name">姓名</FieldLabel>
            <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" maxLength={30} />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="add-sid">学号（选填）</FieldLabel>
            <Input id="add-sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-11 font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="add-gender">性别（选填）</FieldLabel>
              <Input id="add-gender" value={gender} onChange={(e) => setGender(e.target.value)} className="h-11" maxLength={10} />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="add-seat">座号（选填）</FieldLabel>
              <Input id="add-seat" type="number" value={seatNo} onChange={(e) => setSeatNo(e.target.value)} className="h-11" min={1} />
            </div>
          </div>
          <ErrorText message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="min-h-11" disabled={saving} onClick={() => void submit()}>创建学生</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── 编辑学生 ───────────────────────────

interface EditStudentDialogProps {
  student: ManageStudent | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export function EditStudentDialog({ student, onOpenChange, onDone }: EditStudentDialogProps) {
  const { teacher } = useHomeroomScope()
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [seatNo, setSeatNo] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (student) {
      setName(student.name)
      setGender(student.gender ?? '')
      setSeatNo(student.seat_no == null ? '' : String(student.seat_no))
      setNote(student.note ?? '')
      setStatus(student.status ?? 'active')
      setError(null)
    }
  }, [student])

  if (!student) return null

  async function submit() {
    if (!student) return
    if (!name.trim()) {
      setError('姓名不能为空')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // 基本信息 + 在班状态：单次请求原子提交（后端同一事务落库，
      // 绝不出现「资料保存了但归档失败」的部分保存）
      await requestJson(`/api/manage/students/${encodeURIComponent(student.student_id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          gender: gender.trim() || null,
          seat_no: seatNo.trim() === '' ? null : Number(seatNo),
          note: note.trim() || null,
          status,
        }),
      })
      onOpenChange(false)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const gradeLabel = teacher?.active_grade ? `高${teacher.active_grade}` : '当前年级'

  return (
    <Dialog open={!!student} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑学生：{student.name}</DialogTitle>
          <DialogDescription>
            规范姓名保存到学生主档，全站展示优先使用；已上传成绩中的原始姓名保留为快照。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="edit-name">规范姓名</FieldLabel>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" maxLength={30} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="edit-gender">性别</FieldLabel>
              <Input id="edit-gender" value={gender} onChange={(e) => setGender(e.target.value)} className="h-11" maxLength={10} />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="edit-seat">座号</FieldLabel>
              <Input id="edit-seat" type="number" value={seatNo} onChange={(e) => setSeatNo(e.target.value)} className="h-11" min={1} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="edit-note">备注</FieldLabel>
            <Input id="edit-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" placeholder="如：体委员 / 走读" maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="edit-status">在班状态（{gradeLabel}）</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="edit-status" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">在班</SelectItem>
                <SelectItem value="transferred">转班离班（保留全部数据）</SelectItem>
                <SelectItem value="graduated">毕业离校（保留全部数据）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">转班/毕业只是移出当前班名单，成绩、作业与档案全部保留。</p>
          </div>
          <ErrorText message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="min-h-11" disabled={saving} onClick={() => void submit()}>保存修改</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── 学号管理 ───────────────────────────

interface SidDialogProps {
  student: ManageStudent | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export function SidDialog({ student, onOpenChange, onDone }: SidDialogProps) {
  const { scopes } = useHomeroomScope()
  const [correctSid, setCorrectSid] = useState('')
  const [newSid, setNewSid] = useState('')
  const [newGrade, setNewGrade] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (student) {
      setCorrectSid('')
      setNewSid('')
      setNewGrade(scopes.length ? String(scopes[scopes.length - 1].grade) : '')
      setError(null)
    }
  }, [student, scopes])

  if (!student) return null

  const newGradeScope = scopes.find((scope) => String(scope.grade) === newGrade)

  async function run(action: 'correct' | 'new-year') {
    if (!student) return
    setBusy(true)
    setError(null)
    try {
      if (action === 'correct') {
        // 纠正后旧 student_id 已失效，必须立即关闭对话框并刷新名单
        await requestJson(`/api/manage/students/${encodeURIComponent(student.student_id)}/correct-sid`, {
          method: 'POST',
          body: JSON.stringify({ new_student_id: correctSid.trim() }),
        })
      } else {
        await requestJson(`/api/manage/students/${encodeURIComponent(student.student_id)}/new-year-sid`, {
          method: 'POST',
          body: JSON.stringify({
            new_student_id: newSid.trim(),
            grade: Number(newGrade),
            class_num: newGradeScope?.classNum ?? 0,
          }),
        })
      }
      onOpenChange(false)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!student} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>学号管理：{student.name}</DialogTitle>
          <DialogDescription>
            当前学号 <span className="font-mono">{student.student_id}</span>
            {student.aliases.length > 0 && (
              <>；历史学号：{student.aliases.map((alias) => alias.student_id).join('、')}</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-extrabold text-foreground">纠正录错学号</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              适用于当初录错号的情形：全部成绩、作业、档案与身份关联会整体迁移到新学号，旧学号不再存在。同场考试冲突会被拒绝。
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="纠正后的新学号"
                value={correctSid}
                onChange={(e) => setCorrectSid(e.target.value)}
                className="h-11 font-mono"
                placeholder="输入正确学号"
              />
              <Button variant="outline" className="min-h-11" disabled={busy || !correctSid.trim()} onClick={() => void run('correct')}>
                纠正学号
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-extrabold text-foreground">新增学年学号</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              适用于升学后换号：同一学生主档下新增学号并加入对应学年花名册，旧学号与历史数据原样保留。
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <Input
                aria-label="新学年学号"
                value={newSid}
                onChange={(e) => setNewSid(e.target.value)}
                className="h-11 font-mono"
                placeholder="输入新学年学号"
              />
              <Select value={newGrade} onValueChange={setNewGrade}>
                <SelectTrigger aria-label="新学年年级" className="h-11 w-full sm:w-28"><SelectValue placeholder="学年" /></SelectTrigger>
                <SelectContent>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.grade} value={String(scope.grade)}>{scope.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="min-h-11" disabled={busy || !newSid.trim() || !newGradeScope} onClick={() => void run('new-year')}>
                添加学号
              </Button>
            </div>
          </section>

          <ErrorText message={error} />
        </div>
        {/* 操作成功后对话框立即关闭并刷新名单：纠正后的旧学号不再有效 */}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── 删除学生 ───────────────────────────

interface DeleteStudentDialogProps {
  student: ManageStudent | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export function DeleteStudentDialog({ student, onOpenChange, onDone }: DeleteStudentDialogProps) {
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPreview(null)
    setError(null)
    if (!student) return
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/manage/students/${encodeURIComponent(student.student_id)}/delete-preview`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取删除影响')
        return (await response.json()) as DeletePreview
      })
      .then((data) => setPreview(data))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '无法读取删除影响')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [student])

  if (!student) return null

  async function confirmDelete() {
    if (!student) return
    setDeleting(true)
    setError(null)
    try {
      await requestJson(`/api/manage/students/${encodeURIComponent(student.student_id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      })
      onOpenChange(false)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const hasData = (preview?.total_refs ?? 0) > 0

  return (
    <Dialog open={!!student} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除学生：{student.name}</DialogTitle>
          <DialogDescription>
            仅用于清理误建学生。转班、毕业请使用「编辑」里的在班状态，不要删除。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-lg border border-danger-400/40 bg-danger-50 p-3 text-sm" data-testid="delete-impact">
            <div className="text-xs font-extrabold text-danger-700">删除影响</div>
            {loading || !preview ? (
              <p className="mt-1 text-xs text-muted-foreground">正在统计关联数据…</p>
            ) : (
              <>
                <p className="mt-1 font-bold text-danger-700">{countsToText(preview.counts)}</p>
                {hasData && (
                  <p className="mt-1 text-xs text-danger-600">
                    共 {preview.total_refs} 条关联记录，删除后不可恢复；系统会先自动打包备份当前数据库。
                  </p>
                )}
                {(() => {
                  const kept = preview.other_aliases_kept ?? []
                  const history = preview.imported_history_kept ?? 0
                  if (!kept.length && !history) return null
                  return (
                    <div className="mt-1 rounded-md border border-border bg-background/70 p-2 text-xs text-muted-foreground" data-testid="delete-retention">
                      <div className="font-extrabold text-foreground">删除后仍保留（不会随之删除）</div>
                      {kept.length > 0 && (
                        <p className="mt-0.5">其他历史学号：{kept.join('、')}（主档继续沿用）</p>
                      )}
                      {history > 0 && (
                        <p className="mt-0.5">手工导入的历史成绩 {history} 条（挂在主档下）</p>
                      )}
                    </div>
                  )
                })()}
                {!hasData && (preview.other_aliases_kept?.length ?? 0) === 0 && (preview.imported_history_kept ?? 0) === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">该学生没有任何关联数据，可直接彻底删除。</p>
                )}
              </>
            )}
          </div>
          <ErrorText message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={loading || !preview || deleting}
            onClick={() => void confirmDelete()}
          >
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── 合并重复学生 ───────────────────────────

interface MergeDialogProps {
  open: boolean
  students: ManageStudent[]
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export function MergeDialog({ open, students, onOpenChange, onDone }: MergeDialogProps) {
  const [primaryId, setPrimaryId] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPrimaryId('')
      setDuplicateId('')
      setPreview(null)
      setError(null)
    }
  }, [open])

  function studentById(sid: string): ManageStudent | undefined {
    return students.find((student) => student.student_id === sid)
  }

  async function loadPreview() {
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      const data = (await requestJson('/api/manage/students/merge-preview', {
        method: 'POST',
        body: JSON.stringify({ primary_student_id: primaryId, duplicate_student_id: duplicateId }),
      })) as MergePreview
      setPreview(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取合并预览')
    } finally {
      setBusy(false)
    }
  }

  async function confirmMerge() {
    setBusy(true)
    setError(null)
    try {
      await requestJson('/api/manage/students/merge', {
        method: 'POST',
        body: JSON.stringify({
          primary_student_id: primaryId,
          duplicate_student_id: duplicateId,
          confirm: true,
        }),
      })
      onOpenChange(false)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '合并失败')
    } finally {
      setBusy(false)
    }
  }

  const canPreview = primaryId && duplicateId && primaryId !== duplicateId
  const conflicted = preview != null && !preview.mergeable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>合并重复学生</DialogTitle>
          <DialogDescription>
            同一学生被重复建档时使用：重复学号的成绩、作业、档案并入保留学号，并保留为其历史学号。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="merge-primary">保留的学号（主）</FieldLabel>
            <Select value={primaryId} onValueChange={(value) => { setPrimaryId(value); setPreview(null) }}>
              <SelectTrigger id="merge-primary" className="h-11 w-full"><SelectValue placeholder="选择保留的学号" /></SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.student_id} value={student.student_id}>
                    {student.name} · {student.student_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="merge-duplicate">要并入的重复学号</FieldLabel>
            <Select value={duplicateId} onValueChange={(value) => { setDuplicateId(value); setPreview(null) }}>
              <SelectTrigger id="merge-duplicate" className="h-11 w-full"><SelectValue placeholder="选择重复学号" /></SelectTrigger>
              <SelectContent>
                {students.filter((student) => student.student_id !== primaryId).map((student) => (
                  <SelectItem key={student.student_id} value={student.student_id}>
                    {student.name} · {student.student_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" className="min-h-11" disabled={!canPreview || busy} onClick={() => void loadPreview()}>
            预览合并影响
          </Button>

          {preview && (
            <div
              data-testid="merge-preview"
              className={`rounded-lg border p-3 text-sm ${conflicted ? 'border-danger-400/40 bg-danger-50' : 'border-border bg-secondary/35'}`}
            >
              <div className="text-xs font-extrabold">
                {conflicted ? '存在同场考试冲突，无法自动合并' : '可以合并，将迁入以下数据'}
              </div>
              {conflicted ? (
                <ul className="mt-1 list-inside list-disc text-xs text-danger-700">
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.exam_id}>{conflict.exam_name}（两个学号都有成绩）</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {countsToText(preview.duplicate?.counts)}
                </p>
              )}
              {preview.message && <p className="mt-1 text-xs text-muted-foreground">{preview.message}</p>}
            </div>
          )}

          <ErrorText message={error} />
          {primaryId && duplicateId && primaryId === duplicateId && (
            <p role="alert" className="text-xs font-bold text-danger-600">不能把学生与自身合并</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={!preview || conflicted || busy || !studentById(duplicateId)}
            onClick={() => void confirmMerge()}
          >
            确认合并
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
