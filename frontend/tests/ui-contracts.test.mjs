import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const frontendRoot = process.cwd()
const repoRoot = path.resolve(frontendRoot, '..')

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry)
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute)
    return /\.(?:py|ts|tsx)$/.test(entry) ? [absolute] : []
  })
}

test('direction B design tokens remain the global source of truth', () => {
  const globals = read('frontend/src/app/globals.css')
  const tailwind = read('frontend/tailwind.config.js')

  assert.match(globals, /--background:\s*36 33% 97%/)
  assert.match(globals, /--foreground:\s*210 20% 23%/)
  assert.match(globals, /--primary:\s*211 47% 44%/)
  assert.match(tailwind, /brand:[\s\S]*'#3b6ea5'/)
  assert.match(tailwind, /chart:[\s\S]*1:\s*'#3b6ea5'/)
})

test('application shell owns the persistent homeroom scope', () => {
  const layout = read('frontend/src/app/layout.tsx')
  const provider = read('frontend/src/components/providers/HomeroomScopeProvider.tsx')
  const topbar = read('frontend/src/components/layout/Topbar.tsx')
  const shell = read('frontend/src/components/layout/Shell.tsx')

  assert.match(layout, /<HomeroomScopeProvider>/)
  assert.match(provider, /target_class_high1/)
  assert.match(provider, /target_class_high2/)
  assert.match(provider, /target_class_high3/)
  assert.match(provider, /\/api\/rollover\/active-grade/)
  assert.match(topbar, /<ScopeSelect/)
  assert.match(topbar, /sm:hidden/)
  assert.match(shell, /lg:pl-\[232px\]/)
})

test('shared page and state patterns expose semantic headings and alerts', () => {
  const pageHeader = read('frontend/src/components/patterns/PageHeader.tsx')
  const statePanel = read('frontend/src/components/patterns/StatePanel.tsx')
  const sectionCard = read('frontend/src/components/patterns/SectionCard.tsx')
  const statCard = read('frontend/src/components/patterns/StatCard.tsx')

  assert.match(pageHeader, /<h1/)
  assert.match(statePanel, /role=\{tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(sectionCard, /<h2/)
  assert.match(statCard, /tabular-nums/)
})

test('dashboard consumes active scope and never substitutes failed data with fabricated metrics', () => {
  const dashboard = read('frontend/src/app/page.tsx')
  const weeklyFocus = read('frontend/src/components/WeeklyFocusCard.tsx')

  assert.match(dashboard, /useHomeroomScope\(\)/)
  assert.match(dashboard, /\/api\/exams\?grade=\$\{grade\}/)
  assert.match(dashboard, /class_num=\$\{classNum\}/)
  assert.match(dashboard, /AbortController/)
  assert.match(dashboard, /requestIdRef/)
  assert.match(dashboard, /controller\.signal\.aborted \|\| requestId !== requestIdRef\.current/)
  assert.match(dashboard, /focusError/)
  assert.match(dashboard, /部分数据未能加载/)
  assert.match(dashboard, /\/api\/homework\/kpi\?class_num=\$\{classNum\}/)
  assert.match(dashboard, /\/api\/homework\/warnings\?class_num=\$\{classNum\}/)
  assert.match(dashboard, /homeworkError/)
  assert.match(dashboard, /暂无作业缺交记录/)
  assert.match(dashboard, /主三门班均趋势/)
  assert.match(dashboard, /role="img"/)
  assert.match(dashboard, /className="sr-only"/)
  assert.match(weeklyFocus, /AbortController/)
  assert.match(weeklyFocus, /\[classNum, grade, reloadKey, scopeLoading\]/)
  assert.match(weeklyFocus, /min-h-11/)
  assert.doesNotMatch(dashboard, /Math\.random|mock|示例数据/)
})

test('dashboard homework endpoints validate and filter the active bound class', () => {
  const router = read('backend/app/homework/router.py')
  const service = read('backend/app/homework/service.py')

  assert.match(router, /async def hw_kpi\([\s\S]*class_num: Optional\[int\] = None/)
  assert.match(router, /async def hw_warnings\(class_num: Optional\[int\] = None\)/)
  assert.match(router, /请求班级与当前教师绑定班级不一致/)
  assert.match(service, /ClassRoster\.class_num == int\(class_num\)/)
  assert.match(service, /def kpi\([\s\S]*class_num=None\)/)
  assert.match(service, /def warnings\(db, start, end, class_num=None\)/)
})

test('scope mutations refresh global teacher state and legacy pages cannot retain stale class data', () => {
  const provider = read('frontend/src/components/providers/HomeroomScopeProvider.tsx')
  const upload = read('frontend/src/app/upload/page.tsx')
  const rollover = read('frontend/src/app/settings/rollover/page.tsx')
  const correlation = read('frontend/src/app/homework/correlation/page.tsx')

  assert.match(provider, /window\.location\.reload\(\)/)
  assert.doesNotMatch(provider, /homeroom-scope-changed/)
  assert.match(upload, /await refreshTeacher\(\)/)
  assert.match(rollover, /refreshTeacher/)
  assert.match(rollover, /teacher\?\.target_class_high3 != null/)
  assert.match(correlation, /AbortController/)
  assert.match(correlation, /return \(\) => controller\.abort\(\)/)
})

test('mobile sidebar actions meet the 44px touch-target contract', () => {
  const sidebar = read('frontend/src/components/layout/Sidebar.tsx')
  const sheet = read('frontend/src/components/ui/sheet.tsx')

  assert.match(sidebar, /min-h-11/)
  assert.match(sidebar, /h-11 w-11/)
  assert.match(sheet, /SheetPrimitive\.Close className="[^"]*h-11 w-11[^"]*items-center justify-center/)
})

test('exam analysis keeps scoped requests, accessible sorting, and complete mobile scores', () => {
  const list = read('frontend/src/app/exam/page.tsx')
  const detail = read('frontend/src/app/exam/[id]/page.tsx')
  const tableShell = read('frontend/src/components/patterns/DataTableShell.tsx')
  const mobileMatrix = read('frontend/src/components/patterns/ScoreMatrixMobile.tsx')

  assert.match(list, /useHomeroomScope\(\)/)
  assert.match(list, /\/api\/exams\?grade=\$\{activeScope!\.grade\}/)
  assert.match(list, /AbortController/)
  assert.match(list, /<ExamMobileCard/)
  assert.match(list, /statsErrors/)
  assert.match(list, /统计暂时不可用/)
  assert.match(list, /statsError=\{statsErrors\[exam\.id\]\}/)
  assert.match(detail, /useHomeroomScope\(\)/)
  assert.match(detail, /const \{ activeScope, loading: scopeLoading, error: scopeError \} = useHomeroomScope\(\)/)
  assert.match(detail, /examData\.exam\.grade !== currentScope\.grade/)
  assert.match(detail, /class_num=\$\{currentScope\.classNum\}/)
  assert.match(detail, /focusError/)
  assert.match(detail, /focusError \? null : focusList\.length/)
  assert.match(detail, /student\.class_num === activeScope\?\.classNum/)
  assert.match(detail, /aria-pressed=\{onlyCurrentClass\}/)
  assert.match(detail, /AbortController/)
  assert.match(detail, /aria-sort=/)
  assert.match(detail, /score == null \? '—'/)
  assert.match(detail, /<ScoreMatrixMobile/)
  assert.match(detail, />年级百分位</)
  assert.match(detail, />学籍排名</)
  assert.match(detail, />年级排名</)
  assert.match(detail, /text-right tabular-nums/)
  assert.match(detail, /inline-flex min-h-11 items-center font-medium/)
  assert.doesNotMatch(detail, /size="sm"/)
  assert.doesNotMatch(detail, /className="h-8 px-2\.5 text-xs"/)
  assert.match(tableShell, /overflow-auto/)
  assert.match(mobileMatrix, /md:hidden/)
})

test('student views preserve scoped identity history and A4 report isolation', () => {
  const list = read('frontend/src/app/student/page.tsx')
  const profile = read('frontend/src/app/student/[id]/page.tsx')
  const report = read('frontend/src/app/student/[id]/report/page.tsx')
  const homeworkCard = read('frontend/src/components/HomeworkCard.tsx')
  const globals = read('frontend/src/app/globals.css')

  assert.match(list, /useHomeroomScope\(\)/)
  assert.match(list, /row\.current_grade === activeScope\.grade && row\.class_num === activeScope\.classNum/)
  assert.doesNotMatch(list, /row\.history\?\.some/)
  assert.match(list, /AbortController/)
  assert.match(profile, /<PageHeader/)
  assert.match(profile, /useHomeroomScope\(\)/)
  assert.match(profile, /该学生不属于当前班级/)
  assert.match(profile, /fetch\('\/api\/students'/)
  assert.match(profile, /<HomeworkCard/)
  assert.match(profile, /<StudentNotes/)
  assert.match(report, /useHomeroomScope\(\)/)
  assert.match(report, /该学生不属于当前班级/)
  assert.match(report, /作业数据暂不可用/)
  assert.match(report, /成长档案暂不可用/)
  assert.match(report, /reportMainTrend = mainTrend\.slice\(-6\)/)
  assert.match(report, /\/api\/students\/\$\{studentId\}/)
  assert.doesNotMatch(report, /print:fixed/)
  assert.match(report, /min-height: 0 !important/)
  assert.match(homeworkCard, /if \(!response\.ok\) throw new Error/)
  assert.match(homeworkCard, /state === 'error'/)
  assert.match(globals, /size:\s*A4 portrait/)
})

test('homework module preserves scoped requests, partial success, mobile cards, and literal chart colors', () => {
  const dashboard = read('frontend/src/app/homework/page.tsx')
  const manage = read('frontend/src/app/homework/manage/page.tsx')
  const warnings = read('frontend/src/app/homework/warnings/page.tsx')
  const settings = read('frontend/src/app/homework/settings/page.tsx')
  const correlation = read('frontend/src/app/homework/correlation/page.tsx')
  const smartInput = read('frontend/src/components/homework/SmartInputBox.tsx')
  const homeworkNav = read('frontend/src/components/homework/HomeworkNav.tsx')
  const warningList = read('frontend/src/components/homework/WarningList.tsx')
  const homeworkRouter = read('backend/app/homework/router.py')
  const homeworkService = read('backend/app/homework/service.py')

  for (const source of [dashboard, manage, warnings, settings, correlation]) {
    assert.match(source, /useHomeroomScope\(\)/)
    assert.match(source, /AbortController/)
    assert.match(source, /class_num=/)
    assert.match(source, /<PageHeader/)
    assert.match(source, /<StatePanel/)
  }

  assert.match(dashboard, /Promise\.allSettled/)
  assert.match(dashboard, /部分数据未能加载/)
  assert.match(dashboard, /不会伪装为零/)
  assert.match(dashboard, /#3b6ea5/)
  assert.match(dashboard, /#c98a4b/)
  assert.match(dashboard, /<SmartInputBox/)
  assert.match(smartInput, /解析预览/)
  assert.match(smartInput, /tone: 'success' \| 'partial' \| 'error'/)
  assert.match(smartInput, /subject` 继续表示作业种类/)
  assert.match(manage, /md:hidden/)
  assert.match(settings, /role="switch"/)
  assert.match(warnings, /按作业种类/)
  assert.match(correlation, /return \(\) => controller\.abort\(\)/)
  assert.match(correlation, /role="img"/)
  assert.match(homeworkNav, /min-h-11/)
  assert.match(dashboard, /按日期查看缺交记录/)
  assert.match(dashboard, /按作业种类查看缺交记录/)
  assert.match(dashboard, /按学生查看缺交记录/)
  assert.match(warningList, /min-h-11 min-w-11/)
  assert.match(warnings, /min-h-11 min-w-11/)
  assert.match(homeworkRouter, /def _validated_scope\(/)
  assert.match(homeworkRouter, /def _find_student_id\(db, name, grade: int, class_num: int\)/)
  assert.match(homeworkService, /def _latest_exam_id\(db, grade=None\)/)
  assert.match(homeworkService, /class_num=class_num/)
})

test('growth notes and AI drawer preserve follow-up, streaming, and active class context', () => {
  const notes = read('frontend/src/components/StudentNotes.tsx')
  const chat = read('frontend/src/components/ChatDrawer.tsx')
  const toolCall = read('frontend/src/components/ToolCallCard.tsx')

  assert.match(notes, /AbortController/)
  assert.match(notes, /follow_up_done/)
  assert.match(notes, /method: 'PUT'/)
  assert.match(notes, /method: 'DELETE'/)
  assert.match(notes, /catch \(cause\)/)
  assert.match(notes, /min-h-11/)
  assert.match(notes, /tone="error"/)

  assert.match(chat, /useHomeroomScope\(\)/)
  assert.match(chat, /grade: scope\?\.grade/)
  assert.match(chat, /class_num: scope\?\.classNum/)
  assert.match(chat, /event\.type === 'tool_call'/)
  assert.match(chat, /event\.type === 'tool_result'/)
  assert.match(chat, /event\.type === 'tool_error'/)
  assert.doesNotMatch(chat, /output: '已完成'/)
  assert.match(chat, /!activeScope/)
  assert.match(chat, /<ToolCallCard/)
  assert.match(chat, /h-\[100dvh\]/)
  assert.match(chat, /env\(safe-area-inset-bottom\)/)
  assert.match(chat, /role="alert"/)
  assert.match(toolCall, /aria-expanded=/)
  assert.match(toolCall, /min-h-11/)
  assert.match(toolCall, /STATUS_LABEL/)
})

test('upload and rollover preserve unique files, real unbinding, dynamic grades, and backend error detail', () => {
  const upload = read('frontend/src/app/upload/page.tsx')
  const rollover = read('frontend/src/app/settings/rollover/page.tsx')
  const ingest = read('backend/app/ingest/router.py')
  const rolloverRouter = read('backend/app/rollover/router.py')
  const rolloverService = read('backend/app/rollover/service.py')
  const identity = read('backend/app/analysis/identity.py')
  const main = read('backend/app/main.py')

  assert.match(ingest, /uuid\.uuid4\(\)\.hex/)
  assert.match(ingest, /TOKEN_RE\.fullmatch/)
  assert.match(ingest, /"filename": filename/)
  assert.match(upload, /filename: it\.filename/)
  assert.match(upload, /setFiles\(\(prev\) => \[\.\.\.prev, \.\.\.next\]\)/)
  assert.match(upload, /await postBind\(1, h1\)/)
  assert.match(upload, /await postBind\(2, h2\)/)
  assert.match(upload, /await postBind\(3, h3\)/)
  assert.match(main, /has_body_class = "class_num" in body/)
  assert.match(rolloverRouter, /g2_grade - 1/)
  assert.match(rolloverRouter, /target_grade: Literal\[2, 3\] = 2/)
  assert.match(identity, /previous_grade = target_grade - 1/)
  assert.match(rolloverService, /ClassRoster\.class_num == class_num/)
  assert.match(rollover, /requestJson/)
  assert.match(rollover, /body\?\.detail \|\| body\?\.message/)
  assert.match(rollover, /target_grade: grade/)
  assert.match(rollover, /grade: grade - 1/)
  assert.doesNotMatch(rollover, /grade:\s*1,/)
})

test('runtime source contains no fixed class 6 fallback', () => {
  const files = [
    ...sourceFiles(path.join(repoRoot, 'frontend/src')),
    ...sourceFiles(path.join(repoRoot, 'backend/app')),
  ]
  const forbidden = [
    /class_num\s*[=:]\s*6\b/,
    /classNum\s*[=:]\s*6\b/,
    /class_num=6\b/,
    /默认\s*6\s*班/,
  ]
  const violations = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return forbidden.some((pattern) => pattern.test(source))
      ? [path.relative(repoRoot, file)]
      : []
  })

  assert.deepEqual(violations, [])
})
