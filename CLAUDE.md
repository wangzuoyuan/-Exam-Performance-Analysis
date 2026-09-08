# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

产品名称为 **成绩分析（班主任版）**。全站以教师已绑定的 `grade + class_num` 为唯一运行时作用域；禁止添加固定班号回退。

## 快速命令

跨平台启动器在 `run.py`，所有 `.sh / .command / .bat` 双击入口都委托给它。

```bash
# 一键启动后端 8000 + 前端 3000
python run.py start
# 重启（启动器检测到端口占用会跳过，必须先停）
python run.py stop && python run.py start
# 完全重置（清空 ~/.exam-tracker/；执行前会自动快照到 ~/.exam-tracker-backups）
python run.py init
# 数据备份 / 恢复（备份目录在 DATA_DIR 之外，不被 init 清空）
python run.py backup
python run.py restore [备份文件名]   # 省略则用最新一份

# 后端（带 reload，单独开发用）
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm run dev          # localhost:3000
npx tsc --noEmit                    # 类型检查
npm run build                       # 生产构建
npm run test:ui                     # UI 契约 + 班级作用域交互测试

# 后端测试
cd backend && source .venv/bin/activate && pytest tests/
pytest tests/test_excel_parser.py::test_xxx  # 单个用例
# 换届/身份子系统用例：test_identity / test_rollover / test_roster_import（粘贴名册双格式 +
#   临时学号/正式学号替换/旧缺陷行收编）/ test_rollover_leftclass / test_student_union /
#   test_migrate_homeroom / test_chat_tools_union（按人合并口径）

# 日志
tail -f ~/.exam-tracker/backend.log
tail -f ~/.exam-tracker/frontend.log
```

## 架构概览

**后端**：FastAPI + SQLite（`~/.exam-tracker/db.sqlite`），通过 SQLAlchemy 访问。路由模块挂载在 `/api` 前缀下：`ingest`（上传）/ `analysis`（查询）/ `chat`（SSE 流式对话）/ `homework`（作业）/ `notes`（档案）/ `backup`（备份恢复）/ `rollover`（升级换届，跨学年身份接续）/ `student_management`（学生管理）。

**前端**：Next.js 14 App Router + shadcn/ui + Recharts + Tailwind。全局布局由 `Shell.tsx`（侧边栏 + Topbar）管理，`ChatDrawer` 在 `layout.tsx` 全局挂载。页面：`/`(仪表盘，含「本周关注」「数据备份」卡) `/upload` `/compare` `/exam` `/student`（学生页含作业卡片、成长/谈话档案、「导出家长会一页纸」入口）`/student/[id]/report`(打印友好一页纸) `/homework`(作业，含 `/manage` `/warnings` `/correlation` `/settings` 子页)。

**数据库**：成绩相关 6 张表——`teacher`、`exam`、`upload`、`subject_score`、`total_score`、`class_average`；另有 `analysis_config`（段位阈值，单行 id=1）。作业相关 5 张表（原 Flask「作业跟踪」合并而来）——`class_roster`（花名册，主键真实学号 `student_id`，含座号/性别/`excluded`/`status` 在班状态：NULL/active=在班、transferred=转班、graduated=毕业，归档不删数据）、`homework_record`、`homework_collection`（收交台账：某班某天某学科收过作业，由录入「数学：全交」这类行写入，唯一约束 date+subject+grade+class_num 幂等）、`special_record`、`homework_setting`。档案 1 张表——`student_note`（成长/谈话档案：category 谈话/观察/家访/家长沟通/奖惩、content、follow_up 跟进项）。变更审计 1 张表——`student_change_log`（学生管理操作：op_type、identity、字段级前后摘要、写入时的 `grade`/`class_num` 作用域——列表只回当前绑定作用域，不含任何凭据）。作业与档案均按真实学号 `student_id` 与成绩表关联。

**身份层（跨学年身份接续，升级换届后引入）**：3 张新表——`student_identity`（「人」聚合根，含 `display_name`/`gender`/`ext_key`，后者预留身份证/全国学籍号，默认不用）、`student_alias`（学号→identity 映射，`grade` 区分学年，一人可多号，唯一约束 `uq_alias_student`）、`imported_history`（手工导入的历史分数，**与全年级排名/班均/段位计算完全隔离**，仅个人画像展示）；另有 `rollover_confirm_batch`（同名批量确认的批次快照，undo 只删本批事务实际新建的 alias/identity，绝不触碰提交前已有关联）。新列 `class_roster.grade`（名册行所属年级 1/2/3，支持换届后高一/高二名册并存）；`homework_setting.active_grade` 是一行 KV（key=`active_grade`，缺省回落库内最大年级）。`analysis/identity.py` 是身份子系统对外唯一契约：`identity_of` / `person_ids` / `ensure_identity` / `link_aliases`（二者支持 `commit=False`，供批量确认单事务组合写）/ `unlink_alias` / `name_candidates` / `import_crosswalk`。**核心不变式**：`person_ids(db, sid)` 在学号未链接时退化为 `{sid}`——单学年分析仍按 `class_num` 过滤，只有以学生为中心的跨学年读侧才解析 identity，因此零回归。`db/migrate_homeroom.py` 在启动时跑（`main.py` 调用），PRAGMA 门控、幂等可重跑（给 `class_roster` 补 `grade` 与 `status` 列）；遗留的教学版残留（孤立的 `teaching_class*` 表、`class_roster.class_label` 列）原样保留不动。

**临时学号（先建册后出分）**：换届向导粘贴名单支持仅「姓名」行，`rollover/service.py` 生成稳定临时学号 `TMP-{grade}-{class}-{name}`（同班同名幂等、跨班不冲突，绝不拿姓名直接当主键），立即可用于作业花名册/录入；之后在同一输入框粘贴「学号,姓名」即可把占位行事务性替换为正式学号（homework_record / special_record / student_note / student_alias 随迁，excluded/座号/性别保留），后续成绩上传用正式学号自然接续。占位判定**精确等于** `temp_sid(grade, class, name)`——任何以 `TMP-` 开头的真实学号都不是占位行，绝不被替换/删除。所有带学号的导入行（含直接建册与「从成绩派生」）统一走 `_validate_official_sid`：成绩库姓名、目标年级班级、已挂 `StudentAlias` 与本行学生不符即整批拒绝（同名且作用域一致可安全接续）。`from_scores=true` 从成绩派生复用同一条替换事务，先建册后出分的学生自动换成正式学号并迁移全部依赖，不再 merge 出第二条重复行。旧版缺陷行（`student_id=姓名`、`class_num/name` 为空、grade=目标年级）在再次粘贴同名时被严格匹配收编（收编前比对两侧身份别名：不同 identity 整批拒绝，同 identity 收编且删除缺陷学号别名不留孤儿），绝不触碰高一年级数据。`/api/students` 与 `/api/students/{id}` 已并入 roster-only 学生（成绩/名次字段为 null，前端显示「—」）：列表只纳入教师绑定年级班级的 roster-only 行；已关联身份的 roster-only 学号与旧成绩学号并入同一「人」，以高二学号为当前代表（`current_grade`/`class_num` = 高二目标班，旧学号进 `history`）；详情把合法花名册年级并入 `grades`/`class_by_grade`（顶层 `class_num` 取最高年级作用域），仅凭花名册可见时须属教师绑定班，他班 404。

## 部署（Docker / 群晖 NAS）

同一套代码既能本地 `run.py` 跑，也能 Docker 部署（不再维护单独副本）。部署文件：根 `docker-compose.yml`（backend + frontend + caddy 三服务，项目名 `grade_tracker`）、`Caddyfile`（`:8080` 路径分流 /api→backend、/→frontend）、`backend/Dockerfile`、`frontend/Dockerfile`（Next standalone）、`DEPLOY.md`（群晖 NAS 完整手册）。

部署特性**对本地开发无感（默认关闭）**：

- **登录鉴权**：`backend/app/auth.py` + `auth_router.py` + 前端 `AuthGate.tsx`。仅当设了 `APP_PASSWORD` **且**请求 Host 命中 `PUBLIC_HOST`（外网域名入口）时要求会话；内网 IP / 本地 dev / 未设密码一律放行。中间件挂在 `main.py`，放行 `/api/login`、`/api/logout`、`/api/auth/status`、`/api/health`。
- **数据目录**：`backend/app/paths.py` 的 `DATA_DIR`/`BACKUP_DIR` 读环境变量 `EXAM_TRACKER_DIR`/`EXAM_TRACKER_BACKUP_DIR`，缺省回落 `~/.exam-tracker`；Docker 镜像内设为 `/data` 挂卷。所有原先硬编码 `~/.exam-tracker` 的地方都改走 `paths.py`。
- **前端**：`next.config.js` 用 `output:'standalone'`；ChatDrawer 聊天地址生产走同源 `/api`（经 Caddy）、本地 dev 直连 `:8000`（跟随当前主机名，便于手机同 WiFi 访问）。
- **CORS**：`main.py` 默认放行 `http://<任意主机>:3000`（局域网 dev）+ 可选 `CORS_ORIGINS`；生产同源无需 CORS。

改部署后让 NAS 生效见 `DEPLOY.md`；NAS 上 compose 命令需带 `-p grade_tracker`（目录名含中文，裸跑会误建名为 `docker` 的平行栈）。

## API 端点一览

### ingest router
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传 Excel，返回解析结果 + 候选班号 |
| GET  | `/api/uploads` | 上传历史 |

### analysis router
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/exams` | 考试列表，支持 `?grade=` 筛选 |
| DELETE | `/api/exams/{id}` | 删除考试及所有关联数据（级联） |
| GET  | `/api/exams/{id}` | 考试详情：含 `students[]`、`rank_bands`、`rank_distribution`、`class_averages`、`stats` |
| GET  | `/api/focus-list/{id}` | 重点关注名单（临界段/薄弱段/严重偏科），支持 `?class_num=` |
| GET  | `/api/students` | 学生列表（按「人」去重）：合并同一人多学号（含已关联身份的 roster-only 学号，高二学号为当前代表、旧学号进 history），返回当前班级/学号 + 历史学号 + 最近主三门摘要；roster-only 行仅纳入教师绑定年级班级；`?search=` 模糊匹配 |
| GET  | `/api/students/{id}` | 学生跨学年画像：含 `main_total_trend`（每项含 `class_rank`）、`five_trend`、`nine_trend`、`plus3_trend`、`san3_trend`、`subject_trend`（单科含 `grade_score`）；带 `identity.aliases`（每个学号各年级 class_num）、`class_by_grade`（JSON 字符串键，并入合法花名册年级，顶层 `class_num` 取最高年级作用域）、每个趋势点 `imported` 标记、合并 `imported_history`（隔离，不进排名/班均）；仅凭花名册可见的学生须属教师绑定班（他班 404） |
| GET  | `/api/class/compare` | 班级横向对比，支持 `?exam_id=` |
| GET  | `/api/subject-weakness/{id}` | 单科薄弱名单，支持 `?class_num=` |
| GET  | `/api/band-trend` | 历次考试三段（高分/临界/薄弱）人数趋势，支持 `?grade=&class_num=` |
| GET  | `/api/rank-metrics` | 返回可选排名指标，支持 `?grade=&mode=range\|frequency` |
| GET  | `/api/rank-range` | 按指标和年级排名区间筛选学生 |
| GET  | `/api/rank-frequency` | 多场考试各排名区间频次统计 |
| GET  | `/api/analysis-config` | 读取段位阈值 |
| PUT  | `/api/analysis-config` | 保存段位阈值 |

> 注：`GET /api/teacher` 现返回 `active_grade` + `has_pending_rollover`；`POST /api/uploads/commit`、旧版 `/api/uploads` 在检测到高二名册而身份层为空时返回 `suggest_rollover: true`。

### chat router
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | SSE 流式，支持 Anthropic 和 OpenAI 兼容两种 provider |
| GET  | `/api/chat/config` | 返回当前 LLM 配置（provider / model，不暴露 key） |

### homework router（`/api/homework`，`homework/router.py`）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/records` `/special-records` | 智能文本录入缺交 / 特殊记录（by_student / by_subject 两模式），录入后自动导出当天 Excel |
| GET  | `/kpi` `/trend` `/subjects` `/rankings` `/warnings` | 看板统计；`warnings` 为连续缺交预警（连续 2 次黄、≥3 次红） |
| GET  | `/correlation` | 缺交 × 成绩相关：默认总缺交 × 主三门排名；`?subject=` 切到该科缺交 × 该科年级百分位 |
| GET  | `/correlation/subjects` | 各科「缺交拖成绩」皮尔逊相关系数排序 |
| GET  | `/student/{student_id}` | 单个学生作业概况（供学生画像页作业卡片） |
| GET/PUT/DELETE | `/manage/records[/{id}]` | 记录管理；列表支持 `?date=&student=&subject=` 筛选（供看板图表下钻） |
| GET/POST/DELETE/PUT | `/roster[/{student_id}[/toggle-excluded]]` | 花名册增删查 + 排除统计开关 |
| GET/PUT | `/semester` | 读/编辑当前学期（无当前学期行时以按日自动推算兜底） |
| GET/POST | `/semesters` | 历史学期列表 / 新增（`make_current` 可选；POST 返回新列表） |
| PUT | `/semesters/{id}/current` | 设为当前学期（全表置 0 后目标置 1，单事务） |
| GET  | `/api/weekly-focus` | 本周关注名单：合并连续缺交预警 + 本周缺交激增 + 最近考试临界/薄弱/偏科 + 谈话跟进待办（缺交驱动，不依赖新考试） |

### notes router（`/api/notes`，`notes/router.py`）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/notes/{student_id}` | 某生成长/谈话档案列表 |
| POST | `/api/notes` | 新增档案条目 |
| PUT  | `/api/notes/{id}` | 编辑 / 勾选跟进完成 |
| DELETE | `/api/notes/{id}` | 删除 |

### backup router（`/api/backup`，`backup/router.py`）
备份目录 `~/.exam-tracker-backups`（在 DATA_DIR 之外，不被 `init` 清空）。
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/backup` | 打包 db.sqlite + homework_exports 为时间戳 zip |
| GET  | `/api/backups` | 备份列表 |
| GET  | `/api/backup/{name}/download` | 下载备份 |
| POST | `/api/restore` | 恢复（先自动备份当前库，再覆盖，建议重启） |

### student_management router（`/api/manage`，`student_management/router.py`，学生管理）
作用域由服务端强制为教师当前绑定的 grade+class_num（active_grade 驱动），端点不接收裸 class_num；身份层复用 `analysis/identity.py`，学号校验复用 `rollover/service.py`，绝不按姓名自动合并。
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/manage/students` | 管理列表（花名册 ∪ 本班成绩学号），含主档字段/关联计数/最近主三门；`?search=&include_archived=` |
| GET | `/api/manage/students/{id}` | 单生详情：主档 + 花名册 + 别名 + 计数 |
| POST | `/api/manage/students` | 新建学生（花名册行+主档+alias 一次建齐；不填学号生成临时学号 temp_sid，同名拒绝、学号占用拒绝） |
| PUT | `/api/manage/students/{id}` | 编辑：规范姓名/性别/备注写主档并同步该身份全部花名册展示名，座号与在班状态（`status`，与基本信息同一请求单事务落库）写花名册；`SubjectScore.name` 快照不改写；只转发显式提交的字段（`model_fields_set` 区分「未提交」与「显式 null 清空」，UNSET 哨兵） |
| POST | `/api/manage/students/{id}/correct-sid` | 纠正录错学号：单事务迁移 SubjectScore/TotalScore/HomeworkRecord/SpecialRecord/StudentNote/花名册/alias；目标被占、同场考试双方有成绩、跨班越权 → 422 整体回滚 |
| POST | `/api/manage/students/{id}/new-year-sid` | 新增学年学号：只加同身份 alias + 目标学年花名册行，旧号与历史保留；目标 grade+class 必须与教师绑定一致（409）；目标班已有同号行时先验身份与姓名——同身份才幂等，无 alias 且规范姓名一致的既有行才安全挂接，异名/他身份一律拒绝（422），绝不提前返回成功掩盖占用 |
| GET | `/api/manage/students/{id}/delete-preview` | 删除影响预览：各业务表计数 + 身份影响 |
| DELETE | `/api/manage/students/{id}` | 删除：与 delete-preview 的 `requires_confirm` 契约一致——干净误建学生（无业务引用/其他 alias/导入历史）`confirm=false` 直删；有任一风险时需 `{"confirm":true}`，有业务数据时先复用 `backup.router.create_backup` 自动备份再单事务删除；身份有其他 alias/导入历史则保留主档 |
| POST | `/api/manage/students/{id}/archive` | 在班状态：transferred/graduated/active（归档只改状态绝不删数据，默认列表隐藏） |
| POST | `/api/manage/students/merge-preview` | 合并预览：迁入计数 + 同场考试冲突清单 |
| POST | `/api/manage/students/merge` | 事务性合并：需 confirm 且自动备份；同场考试冲突（双方都有成绩）409 拒绝绝不自动裁决；双方都无主档时以主学号规范姓名建主档，primary 与 duplicate 两个学号都保留为 alias（重复学号即历史学号，绝不丢号） |
| GET | `/api/manage/backfill-preview` | 当前班还没有主档的学生预览 |
| POST | `/api/manage/backfill-identities` | 幂等回填主档：逐人建 identity+alias（source=manual），同名各建独立主档 |
| GET | `/api/manage/change-log` | 变更日志（op_type/前后摘要/备份文件名），只返回当前绑定 grade+class_num 的留痕（每条日志写入时记 `grade`/`class_num`，`migrate_homeroom` 为旧表 PRAGMA 幂等补列），`?student_id=&limit=` 同受作用域约束 |

### rollover router（`/api/rollover`，`rollover/router.py`，升级换届）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/rollover/preview` | 换届预览：检测高二候选名册、未链接学号四态分布、待办状态 |
| POST | `/api/rollover/roster` | 建目标班名册：粘贴名单两种行——仅「姓名」（生成临时学号 `TMP-{grade}-{class}-{name}`，幂等，可先记作业）或「学号,姓名」（正式学号：统一冲突校验——成绩库姓名/目标年级班级/已挂身份别名不符整批拒绝；命中本班同名占位行【精确等于 temp_sid】时事务性替换并把作业/特殊/档案/身份别名迁到正式学号）；`from_scores=true` 从成绩派生复用同一替换逻辑；同时收编旧版缺陷行（`student_id=姓名`、`class_num/name` 为空的行，先比对两侧别名身份）；目标 grade+class 必须与教师绑定一致（409），行校验错误 422。响应 `{created, updated, replaced, repaired, total}` |
| POST | `/api/rollover/link` | 逐人判定：把高一学号与高二学号链接为同一 identity |
| POST | `/api/rollover/link-batch` | 批量链接（四态：已确认/待定/新增/无高一匹配） |
| DELETE | `/api/rollover/link/{student_id}` | 解除某学号的 identity 链接 |
| POST | `/api/rollover/confirm-batch` | 同名批量确认（前端行内三态选择后一键提交）：服务端完整预检——姓名规范化一致、link 未显式指定时必须恰好一个同名候选、候选未被关联、教师绑定目标 grade/class、g2 属目标班 roster 或成绩（他班成绩拒绝且未关联身份）、批内 g1/g2 各自唯一且任意 g1 不得与本批任意 g2 相同（两阶段预检、与输入顺序无关），**绝不信任前端 safe 标记**；全部通过后同一事务落库（link 建同一 identity，new 建独立 identity）并写批次快照，任一违规整批 422 回滚、绝不部分成功。返回 `batch_id` + 逐行结果供页面汇总与撤销 |
| POST | `/api/rollover/confirm-batch/{batch_id}/undo` | 撤销一次批量确认：只删该批实际新建的 alias（仍指向本批 identity 且 `link_source=name_confirmed`）与无 alias/无 imported_history 残留的本批 identity；批次不存在 404、重复撤销/教师绑定与批次班级不一致 409。前端同名表安全项判定与默认选择在 `frontend/src/lib/rollover-batch.ts`（口径与服务端一致：候选学号不得与批内高二学号相同或被多行共享） |
| POST | `/api/rollover/crosswalk` | 导入高一↔高二学号对照表，批量建 identity |
| POST | `/api/rollover/import-history` | 导入手工历史分数到 `imported_history`（隔离） |
| PATCH | `/api/rollover/active-grade` | 切换作业看板当前年级（`homework_setting.active_grade`） |

## 对话工具集（20 个只读工具，`chat/tools.py`）

成绩 15 个：`list_exams` / `student_lookup` / `student_exam_detail` / `student_trend` / `student_learning_profile` / `class_trend` / `compare_classes` / `focus_list` / `subject_weakness` / `subject_progress_ranking` / `multi_exam_progress_ranking` / `band_trend` / `custom_rank_band_trend` / `rank_range_filter` / `rank_frequency_stat`

身份 1 个：`student_identity_lookup`（按姓名/学号返回该「人」的学段履历：历次学号、各年级班级、跨学年链接状态）

作业 3 个：`student_homework_summary` / `class_homework_ranking` / `homework_grade_correlation`（支持 `subject`，总览附各科皮尔逊相关排序）

档案 1 个：`student_notes`（读取某生成长/谈话档案，结合成绩与缺交辅助起草谈话提纲/家长沟通稿）

**跨学年按人合并口径**：5 个以学生为中心的工具（`student_lookup` / `student_trend` / `student_learning_profile` / `student_notes` / `student_homework_summary`）按 `person_ids(db, sid)` 合并同一人的多个学号；班级工具（`focus_list` / `subject_weakness` / `class_trend` / `compare_classes` / `band_trend`）仍是单学年，按 `class_num` 过滤。

新增工具：在 `tools.py` 里添加函数 + 注册到 `TOOL_FUNCTIONS` 字典和 `TOOLS` 列表，`session.py` 的 `execute_tool()` 自动调度。

## 数据流关键路径

**上传链路**：`ingest/router.py` → `filename_parser.py`（文件名解析年级/学期/考试类型）→ `excel_parser.py`（解析 Excel，高一固定列 vs 高二/三 3+3 两种 schema）→ 写入 SQLite。首次上传后弹窗确认班号 → `POST /api/teacher/bind-class`。

**读端链路**：`analysis/router.py` 直接用 SQLAlchemy 查询，**没有使用** `analysis/trends.py` / `class_compare.py` / `focus_list.py` / `cross_year.py`（它们是早期抽象，router 内联了逻辑）。改查询逻辑只需改 `router.py`。学生为中心的端点（`/api/students`、`/api/students/{id}`）经 `analysis/identity.py` 解析 `person_ids`，跨学年合并同一人多个学号；班级端点仍是单学年、按 `class_num` 过滤。`active_grade` 驱动作业看板/排行/预警的单年口径（`homework/service._base_miss_query` 过滤 `ClassRoster.grade == active_grade`）；`student_homework_summary` 按 `person_ids` 合并展示（跨学年可见），但看板仍单年。

**段位阈值**：所有段位计算（`rank_bands`、`focus-list`、`band-trend`、AI 工具）必须调用 `analysis/config.py` 的 `get_band_config()`，不能硬编码默认值。用户在前端修改后，页面展示与 AI 问答口径同步。

**作业模块**：聚合查询集中在 `homework/service.py`（看板/排行/预警/相关性/`weekly_focus`），被 `homework/router.py` 与 `chat/tools.py` 共用；学科归类与录入文本解析在 `homework/parser.py`；Excel 导出在 `homework/export.py`。缺交看板默认口径：过滤 `remark` 非空（请假当天不算缺交）、`subject='全科'`、`excluded=1` 学生。连续缺交预警时间轴 = 该学科缺交日期 ∪ 收交台账日期（录入「数学：全交/齐」写入 `homework_collection`，按 by_subject 模式整体匹配、幂等；`parser.is_full_submission` 判定），全交日也能打断 streak——只有缺交记录时缺-交-缺会被误判为连续。一次性数据迁移脚本 `homework/migrate.py`（按姓名把旧 `homework.db` 的座号映射到成绩库真实学号，幂等可重跑）。多学期管理：`homework_semester` 表存全部学期（is_current 标记当前，服务层事务保证唯一），`db/migrate_semester.py` 启动时把旧 KV 单学期配置迁为**历史**学期（不设当前）；`service.derive_semester()` 在未配置当前学期时按日期推算（9~1 月第一学期、2~6 月第二学期、7~8 月暑假沿用刚结束的第二学期），只算不落库。所有统计的学期区间都经 `get_semester()` 一个入口。

**档案 / 主动提醒 / 备份**：`notes/router.py` 管理 `student_note`（成长/谈话档案），AI 工具 `student_notes` 可读取。`homework/service.weekly_focus()` 合成「本周关注」，复用 `warnings` 与 `chat/tools.focus_list`（懒导入避免循环）。`backup/router.py` 与 `run.py` 的 `backup/restore` 子命令共用同一备份目录 `~/.exam-tracker-backups`；`run.py init` 清空前自动快照。

## 业务口径（指标选择规则）

这些规则写在 `chat/session.py` 系统提示，直接影响 AI 回答质量，修改工具返回值时需保持一致：

- **跨学年趋势**：只能用主三门和语数英原始分；禁止跨高一→高二用九门或 +3 比较
- **总分趋势**：用 `xueji_rank`（学籍排名）；无学籍排名时用 `grade_percentile`
- **高一单科 / 高二高三语数英**：用 `grade_percentile`（百分位降低 = 进步）
- **高二高三 +3 选考单科**：用 `grade_score`（等级分）；等级分精确值为 70/67/64/61/58/55/52/49/46/43/40
- `raw_score` 只用于单点描述（"该次原始分为X"），不得用于趋势计算
- **跨学年身份**：学生可能跨学年换学号；以学生为中心的查询已自动合并同一人的多个学号（`person_ids`），班级口径仍按当年行政班；作业看板/排行/预警只统计 `active_grade` 名册（单年）。

## 前端开发要点

- **新增页面**：不要加 `<header>` / `max-w-*` / `min-h-screen` / `bg-slate-50`，`Shell.tsx` 已接管布局。
- **shadcn 组件**：`npx shadcn@latest add <name>`（包名是 `shadcn`，不是 `shadcn-ui`）。
- **颜色 token**：统一用 `tailwind.config.js` 的 `brand-*` / `success` / `warning` / `danger`；Recharts 内直接写字符串（不接受 CSS 变量）。
- **ChatDrawer 触发**：`window.dispatchEvent(new Event('open-chat'))`，不要直接 import/ref。
- **缺考字段**：API 返回 `null`，前端一律显示 `"—"`，不要显示 `0`。
- **移动端适配**：`Shell.tsx` 已响应式（侧栏收为汉堡菜单、内容区窄屏减边距）。窄屏别写死宽度，用 `w-full sm:w-[..]` + `flex-col sm:flex-row`；超宽数据表（考试成绩矩阵）保留桌面宽表（`hidden md:block`）的同时配一份卡片视图（`md:hidden`，如 `StudentScoreMobileCards`）；多页签用 `overflow-x-auto` 横滑而非换行。`layout.tsx` 已声明 `viewport`，对话输入框用 `text-base`(16px) 防 iOS 聚焦缩放。

## 对话助手配置（`backend/.env`）

```env
# Anthropic（默认）
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=          # 留空用官方；填兼容地址可切换第三方
ANTHROPIC_MODEL=claude-sonnet-4-6

# OpenAI 兼容
CHAT_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_BASE_URL=             # 留空用 api.openai.com；填 /v1 结尾的兼容地址
OPENAI_MODEL=gpt-4o-mini
```

## 测试覆盖

有测试：`api` / `chat_config` / `chat_tools` / `db` / `excel_parser` / `filename_parser` / `homework_parser`（学科解析）/ `homework_router`（看板/相关性/花名册/学期端点 + 皮尔逊单测）/ `notes_router`（档案增删改 + 跟进）/ `roster_import`（换届粘贴名册：双格式解析、临时学号、正式学号替换迁移、直接建册冲突校验、从成绩派生、旧缺陷行收编含别名冲突、作用域校验、roster-only 学生与代表学号）/ `rollover_confirm_batch`（同名批量确认：安全批量成功含 roster-only、多候选拒绝/显式选择、候选占用、批内重复、越权班级、非同名候选、事务回滚零落库、仅撤销本批新增链接）/ `student_management`（学生管理：作用域与归档隐藏、创建同名/学号占用拒绝、编辑改主档同步花名册且 SubjectScore 快照不动 + 区分「未提交/显式 null」与在班状态单事务 + 列表回显主档 note/gender + 无主档只编辑 note 不炸、纠正学号全量迁移与冲突零落库回滚、跨年学号保留历史 + 目标班既有同号行的身份校验三态、删除预览/确认门控与契约一致/自动备份/身份按需保留/干净学生 confirm=false 直删、合并冲突阻止与事务合并 + 双方无主档建主档保双号、回填幂等与同名不合并、变更日志只回当前作用域）/ `backup_weekly`（备份/恢复/本周关注）。前端 `tests/rollover-batch-*.test.*`（无 Dialog、安全项默认勾选、行内多候选、新学生/稍后、一键提交载荷、错误保留选择、结果与撤销、页面接线）与 `tests/student-management*.test.*`（管理页契约：作用域请求、新增/编辑/学号载荷、删除影响计数与 confirm 门控、合并冲突阻止、回填横幅、移动卡片操作、纯逻辑摘要），挂在 `npm run test:ui` 链（`test:rollover-batch` / `test:student-management`）

**无测试**：`analysis/router.py` 的计算逻辑（`trends` / `class_compare` / `focus_list` / `cross_year` / `rank_metrics` 模块同样无测试）。
