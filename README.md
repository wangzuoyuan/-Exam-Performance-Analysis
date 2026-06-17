# 成绩分析 Webapp

面向高中班主任的本地成绩分析 Web 应用。项目支持多场 Excel 成绩导入、跨学年学生画像、班级横向对比、重点关注名单、作业缺交跟踪，以及基于 LLM tool-use 的 AI 对话助手。作业缺交与考试成绩按真实学号打通，可分析「缺交是否拖成绩」。

本项目已按 MIT License 开源，可自由使用、修改和二次分发。

## 功能特性

- **Excel 批量导入**：支持学生成绩明细表和班级均分表，自动从文件名识别年级、学期、考试类型和排序月份；上传时可逐文件确认并修正年级与考试年月，避免文件名识别错误。
- **高一 / 高二高三双口径**：高一支持主三门、五门、九门；高二高三支持主三门、+3、3+3 和选考等级分。
- **考试详情页**：展示班级均分、学生成绩明细、名次段分布、排名频次统计、排名区间筛选和重点关注名单。
- **可自定义关注段位**：高分段 / 临界段 / 薄弱段的排名区间可自行调整，页面图表、历次趋势和 AI 问答口径同步生效。
- **历次段位趋势**：在考试详情页查看本班（或指定班级 / 全年级）三段人数随历次考试的变化趋势折线图。
- **排名筛选与频次统计**：按单次考试筛选指定年级排名区间；按多场考试统计学生落入百分位、40 名一档或精确等级分档位的次数。
- **学生画像页**：展示跨学年主三门趋势、五门趋势、+3 / 3+3 趋势、单科历史和历次考试明细。
- **班级对比页**：按总分或单科均分做多班横向对比，并高亮当前班级。
- **作业跟踪**：智能文本批量录入缺交 / 请假 / 迟到，看板含每日趋势、各科占比、缺交排行、连续缺交预警；图表可点击下钻到按日期 / 学科 / 学生筛选的明细；录入后自动导出当天 Excel；花名册可设「排除统计」学生、可配置学期区间。
- **缺交 × 成绩相关性**：把缺交次数和考试排名放在一起，按学科散点（标注姓名）呈现并用皮尔逊系数排出各科「缺交拖成绩」强弱；学生画像页同时显示成绩趋势与作业缺交卡片（含近期缺交明细）。
- **学生成长 / 谈话档案**：在学生页记录谈话、观察、家访、家长沟通、奖惩等，可设跟进事项并勾选完成；AI 对话可读取档案，结合成绩与缺交帮你起草谈话提纲、家长沟通稿。
- **本周关注（主动提醒）**：仪表盘首屏合并连续缺交预警、本周缺交激增、最近考试临界/薄弱/偏科、谈话跟进待办，打开即知该盯谁；缺交驱动，不依赖新考试。
- **家长会一页纸**：学生页一键生成打印友好的单页（成绩趋势 + 各科 + 作业缺交 + 沟通摘要），用浏览器「打印 / 存为 PDF」。
- **数据备份 / 恢复**：仪表盘一键备份、列表、下载、恢复；备份存于 `~/.exam-tracker-backups`（不被「初始化」清空），初始化前自动快照。
- **AI 对话助手**：支持 Anthropic Messages API 和 OpenAI Chat Completions 兼容接口，使用只读工具查询本地成绩、作业与档案数据后回答（如「6 班缺交最多的 5 人成绩排名如何」「哪门课缺交最拖成绩」「结合最近谈话帮我准备和某某的谈话提纲」）。
- **多场趋势分析**：AI 工具支持最近两次进退步，也支持最近 N 次或指定多场考试合并判断趋势排行。
- **移动端友好**：手机 / 平板访问自适应——侧栏收为汉堡菜单，班级对比筛选器与图表随窄屏伸缩，考试「学生成绩明细」在手机上以「一生一卡」呈现免横向刮宽表，多页签横向滑动，AI 对话抽屉全屏。
- **本地单机部署**：数据库、上传文件和日志默认存放在用户目录 `~/.exam-tracker/`。
- **跨平台启动器**：`run.py` 统一封装 macOS / Windows 的初始化、启动、停止、备份、恢复流程。

## 技术栈

- **后端**：Python 3.11+ / FastAPI / SQLAlchemy / SQLite / openpyxl
- **前端**：Next.js 14 App Router / TypeScript / Tailwind CSS / Recharts / shadcn/ui
- **AI**：Anthropic SDK / OpenAI SDK / SSE 流式响应 / tool-use
- **部署方式**：本地运行，后端默认 `localhost:8000`，前端默认 `localhost:3000`

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- macOS 或 Windows 10/11

### 1. 克隆仓库

```bash
git clone https://github.com/wangzuoyuan/-Exam-Performance-Analysis.git
cd -Exam-Performance-Analysis
```

### 2. 配置对话助手

复制示例环境变量文件：

```bash
cp backend/.env.example backend/.env
```

然后在 `backend/.env` 中填入 API Key。只使用成绩分析页面时可以先不配置 Key；AI 对话助手需要有效 Key。

### 3. 初始化依赖

macOS：

```bash
python3 run.py init
```

Windows：

```bat
python run.py init
```

也可以双击项目目录中的平台脚本：

| 操作 | macOS | Windows |
|------|-------|---------|
| 初始化 | `初始化成绩分析.command` | `初始化成绩分析.bat` |
| 启动 | `启动成绩分析.command` | `启动成绩分析.bat` |
| 停止 | `停止成绩分析.command` | `停止成绩分析.bat` |

### 4. 启动应用

```bash
python3 run.py start
```

启动后访问：

```text
http://localhost:3000
```

`run.py start` 会自动启动：

- FastAPI 后端：`http://localhost:8000`
- Next.js 前端：`http://localhost:3000`

停止服务：

```bash
python3 run.py stop
```

完全重置本地应用数据和依赖：

```bash
python3 run.py init
```

注意：`init` 会清空 `~/.exam-tracker/`，包括本地数据库、上传文件和日志，但不会删除项目代码和 `backend/.env`。

## 页面功能

| 页面 | 路由 | 功能 |
|------|------|------|
| 仪表盘 | `/` | 本周关注、最近考试一览、班级动态、重点关注速览、数据备份 |
| 数据上传 | `/upload` | 绑定班级、上传 Excel、查看解析结果 |
| 考试列表 | `/exam` | 已建档考试列表、搜索、删除误传考试 |
| 考试详情 | `/exam/[id]` | 班级均分表、学生成绩明细、名次段分布（可自定义段位 + 历次趋势）、排名频次统计、排名区间筛选、重点关注 |
| 学生检索 | `/student` | 按姓名或学号查找学生画像 |
| 学生详情 | `/student/[id]` | 跨学年趋势、单科变化、历次考试明细、作业缺交卡片、成长/谈话档案、导出家长会一页纸 |
| 家长会一页纸 | `/student/[id]/report` | 打印友好单页：成绩趋势 + 各科 + 作业缺交 + 沟通摘要 |
| 班级对比 | `/compare` | 多班总分 / 单科均分横向对比 |
| 作业跟踪 | `/homework` | 录入、每日趋势、各科占比、缺交排行、连续缺交预警速览 |
| 记录管理 | `/homework/manage` | 缺交 / 特殊记录的查询、删除（支持 `?date=&student=&subject=` 下钻） |
| 缺交预警 | `/homework/warnings` | 连续缺交按学生 / 按学科两视角 |
| 缺交 × 成绩 | `/homework/correlation` | 按学科散点 + 各科相关强弱排序 |
| 作业设置 | `/homework/settings` | 花名册排除统计、学期配置 |

## 数据和隐私

本项目默认本地运行，不依赖远程业务服务器。

本地数据目录：

```text
~/.exam-tracker/
├── db.sqlite       # SQLite 数据库
├── raw/            # 原始上传 Excel
├── backend.log     # 后端日志
└── frontend.log    # 前端日志
```

开源仓库不会包含：

- `backend/.env`
- `~/.exam-tracker/`
- SQLite 数据库
- 原始 Excel 成绩文件
- `node_modules/`
- `.next/`

隐私提醒：

- 页面分析和普通 API 查询都在本机进行。
- 使用 AI 对话助手时，工具查询结果会被发送给你配置的 LLM 服务商，用于生成回答。
- 如果成绩数据包含真实学生信息，请确认你使用的模型服务、代理服务和网络环境符合本校或本单位的数据合规要求。
- 不建议把真实学生成绩、真实 API Key、数据库文件或上传原始表格提交到公开仓库。

## 数据模型

SQLite 数据库位于 `~/.exam-tracker/db.sqlite`。

| 表 | 说明 |
|----|------|
| `teacher` | 班主任信息和高一 / 高二 / 高三目标班级 |
| `exam` | 考试档案：规范化名称、年级、学期、考试类型、排序日期 |
| `upload` | 上传记录：文件路径、hash、解析类型、解析日志 |
| `subject_score` | 学科成绩长表：每生 × 每考 × 每科 |
| `total_score` | 总分表：主三门、五门、九门、+3、3+3 |
| `class_average` | 班级均分表：各科均分和各类总分均分 |
| `analysis_config` | 重点关注段位阈值（高分段 / 临界段 / 薄弱段排名区间，全局单行） |
| `class_roster` | 班级花名册（作业）：主键真实学号 `student_id`，含座号、性别、`excluded` 排除统计标记 |
| `homework_record` | 缺交记录：学号、日期、科目、内容、备注 |
| `special_record` | 特殊记录：请假、迟到等 |
| `homework_setting` | 作业模块键值配置（学期起止 / 名称） |
| `student_note` | 学生成长 / 谈话档案：类别、内容、跟进事项、跟进状态 |

## Excel 口径

| 项 | 高一 | 高二 / 高三 |
|----|------|-------------|
| 学科结构 | 9 科固定列 | 语数英 + 6 选 3 |
| 单科字段 | 分数、年级百分位 | 语数英：分数 / 百分位；选考：原始分 / 等级分 |
| 总分类型 | 主三门、五门、九门 | 主三门、+3、3+3 |
| 趋势口径 | 总分看学籍排名；单科看年级百分位 | 总分看学籍排名；语数英看年级百分位；选考单科看等级分 |
| 排名频次口径 | 9 门单科按年级百分位五等分；主三门 / 五门按 40 名一档 | 语数英按年级百分位五等分；选考单科按 70、67、64、61、58、55、52、49、46、43、40 精确等级分；主三门 / 3+3 按 40 名一档 |
| 排名区间筛选 | 支持 9 门单科、主三门、五门 | 支持语数英单科、主三门、3+3 |
| 跨学年对比 | 只使用主三门和语数英 | 禁止用九门、+3 或 3+3 做跨学年比较 |

## 后端 API

所有业务 API 默认挂在 `/api`。

### 基础和班主任

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/teacher` | 获取班主任信息，必要时自动初始化 |
| PATCH | `/api/teacher` | 更新班主任姓名 |
| POST | `/api/teacher/bind-class` | 绑定目标班级 |

### 上传

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/uploads/preview` | 上传 Excel 并返回可编辑的识别结果（年级 / 学期 / 类型 / 年月），不入库 |
| POST | `/api/uploads/commit` | 按确认后的元数据正式解析入库 |
| POST | `/api/uploads` | 旧版一步式上传（按文件名自动识别后直接入库，保留兼容） |
| GET | `/api/uploads` | 查看最近上传记录 |

### 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/exams` | 考试列表，支持 `?grade=` |
| DELETE | `/api/exams/{id}` | 删除考试及关联成绩、均分和上传记录 |
| GET | `/api/exams/{id}` | 考试详情：学生明细、统计、班均分、名次段 |
| GET | `/api/focus-list/{id}` | 重点关注名单，支持 `?class_num=` |
| GET | `/api/students/{id}` | 学生跨学年画像 |
| GET | `/api/class/compare` | 班级横向对比，支持 `?exam_id=` |
| GET | `/api/subject-weakness/{id}` | 单科薄弱名单，支持 `?class_num=` |
| GET | `/api/analysis-config` | 获取重点关注段位阈值 |
| PUT | `/api/analysis-config` | 保存自定义段位阈值（高分段 / 临界段 / 薄弱段） |
| GET | `/api/band-trend` | 某年级历次考试三段人数趋势，支持 `?grade=`、`?class_num=` |
| GET | `/api/rank-metrics` | 获取排名区间筛选 / 排名频次统计可选指标，支持 `?grade=`、`?mode=range\|frequency` |
| GET | `/api/rank-range` | 按单次考试、指标和年级排名区间筛选学生，支持 `?exam_id=`、`?metric=`、`?rank_min=`、`?rank_max=`、`?class_num=` |
| GET | `/api/rank-frequency` | 按多场考试统计排名 / 百分位 / 精确等级分频次，支持 `?grade=`、`?metric=`、`?exam_ids=`、`?recent_count=`、`?class_num=` |

### 作业

挂在 `/api/homework`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/homework/records`、`/special-records` | 智能文本录入缺交 / 特殊记录，录入后自动导出当天 Excel |
| GET | `/api/homework/kpi`、`/trend`、`/subjects`、`/rankings`、`/warnings` | 看板统计与连续缺交预警 |
| GET | `/api/homework/correlation` | 缺交 × 成绩；`?subject=` 切到按学科 |
| GET | `/api/homework/correlation/subjects` | 各科「缺交拖成绩」皮尔逊相关排序 |
| GET | `/api/homework/student/{student_id}` | 单个学生作业概况 |
| GET/PUT/DELETE | `/api/homework/manage/records[/{id}]` | 记录管理，列表支持 `?date=&student=&subject=` |
| GET/POST/DELETE/PUT | `/api/homework/roster[/{student_id}[/toggle-excluded]]` | 花名册与排除统计开关 |
| GET/PUT | `/api/homework/semester` | 学期配置 |
| GET | `/api/weekly-focus` | 本周关注名单（合并缺交预警/激增/临界薄弱偏科/谈话跟进） |

### 档案

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes/{student_id}` | 某生成长 / 谈话档案 |
| POST | `/api/notes` | 新增档案条目 |
| PUT | `/api/notes/{id}` | 编辑 / 勾选跟进完成 |
| DELETE | `/api/notes/{id}` | 删除 |

### 备份

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/backup` | 立即备份（db + 作业导出 → 时间戳 zip） |
| GET | `/api/backups` | 备份列表 |
| GET | `/api/backup/{name}/download` | 下载备份 |
| POST | `/api/restore` | 恢复（先自动备份当前库，再覆盖，建议重启） |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | SSE 流式对话 |

## AI 对话助手

对话助手读取 `backend/.env`。

Anthropic 模式：

```env
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

OpenAI 兼容模式：

```env
CHAT_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
```

两种模式共用同一套只读工具。

说明：`backend/.env` 中的非空配置优先于同名环境变量，避免外部 shell 注入的空 `ANTHROPIC_API_KEY` 等变量覆盖本地配置。若对话助手提示「未设置有效的 API Key」，请先确认 `backend/.env` 已正确填写。

### 当前工具集

| Tool | 主要参数 | 用途 |
|------|----------|------|
| `list_exams` | `grade?`, `year_range?` | 罗列已建档考试 |
| `student_lookup` | `name?`, `student_id?` | 按姓名或学号定位学生 |
| `student_exam_detail` | `student_id`, `exam_id` | 某生某次考试完整成绩 |
| `student_trend` | `student_id`, `total_type?`, `exam_ids?` | 某个学生的跨次总分趋势 |
| `student_learning_profile` | `student_id?`, `name?` | 学生综合学情画像 |
| `class_trend` | `class_num`, `metric`, `exam_ids?` | 班级均分时间序列 |
| `compare_classes` | `class_nums[]`, `exam_id`, `metric` | 多班同次横向对比 |
| `focus_list` | `exam_id`, `category?` | 重点关注名单 |
| `subject_weakness` | `class_num`, `exam_id` | 本班单科薄弱清单 |
| `subject_progress_ranking` | `grade`, `subject`, `start_exam_id?`, `end_exam_id?` | 单科进步 / 退步排行榜 |
| `multi_exam_progress_ranking` | `grade`, `metrics?`, `recent_count?`, `exam_ids?`, `direction?` | 最近 N 次或指定多场考试的单科 / 总分趋势排行 |
| `band_trend` | `grade`, `class_num?` | 历次考试高分段 / 临界段 / 薄弱段人数趋势（口径随自定义阈值变化） |
| `custom_rank_band_trend` | `grade`, `rank_max`, `rank_min?`, `total_type?`, `class_num?`, `start_date?`, `end_date?` | 按临时指定的排名区间统计历次人数变化（如“前 350 名人数怎么变”） |
| `rank_range_filter` | `exam_id`, `metric`, `rank_min`, `rank_max`, `class_num?` | 按单次考试筛出指定年级排名区间内的学生 |
| `rank_frequency_stat` | `grade`, `metric`, `exam_ids?`, `recent_count?`, `class_num?` | 统计多场考试中每名学生落入各排名 / 百分位 / 精确等级分档位的次数 |
| `student_homework_summary` | `student_id?`, `name?` | 某生本学期缺交概况（总数、按科目、迟到请假、连续缺交预警） |
| `class_homework_ranking` | `class_num?`, `start_date?`, `end_date?`, `limit?` | 班级缺交排行（排除「不计入统计」学生） |
| `homework_grade_correlation` | `class_num?`, `exam_id?`, `subject?` | 缺交 × 成绩联动；不带 `subject` 附各科皮尔逊相关排序 |
| `student_notes` | `student_id?`, `name?`, `limit?` | 读取某生成长 / 谈话档案，辅助起草谈话提纲、家长沟通稿 |

示例问题：

- `最近两次高一语文、数学、英语、主三门、五门分别进步最大的是谁？`
- `最近5次高一主三门和五门趋势最好的是谁？至少有3次成绩才算。`
- `高二语文退步最大的前10名是谁？`
- `这个学生整体情况怎么样？`
- `高一6班临界段人数最近几次考试是怎么变化的？`
- `高二1班最近3次物理等级分频次怎么样？`
- `高一主三门300到350名有哪些学生？`
- `6班这学期缺交最多的5个学生，他们主三门排名如何？`
- `哪门课缺交最影响成绩？数学缺交多的学生数学成绩怎么样？`

## 开发命令

后端热重载：

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

前端开发：

```bash
cd frontend
npm run dev
```

前端类型检查：

```bash
cd frontend
npx tsc --noEmit
```

前端生产构建：

```bash
cd frontend
npm run build
```

后端测试：

```bash
cd backend
source .venv/bin/activate
pip install pytest
pytest tests/
```

注意：当前部分后端测试会读取真实 `~/.exam-tracker/db.sqlite`。在贡献测试或 CI 前，建议补充独立测试数据库隔离。

## 目录结构

```text
成绩分析webapp/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── db/
│   │   ├── ingest/
│   │   ├── analysis/
│   │   ├── chat/
│   │   ├── homework/       # 作业模块：parser / service / router / export / migrate
│   │   ├── notes/          # 学生成长 / 谈话档案
│   │   └── backup/         # 数据备份 / 恢复
│   ├── pyproject.toml
│   └── tests/
├── frontend/
│   ├── src/app/
│   ├── src/components/
│   ├── package.json
│   └── tailwind.config.js
├── run.py
├── start.sh
├── LICENSE
└── README.md
```

## 贡献指南

欢迎提交 Issue 和 Pull Request。

建议流程：

1. Fork 本仓库。
2. 新建功能分支。
3. 保持改动聚焦，避免提交本地数据、日志、`.env` 或构建产物。
4. 运行必要检查：`npx tsc --noEmit`、`npm run build`、后端相关测试。
5. 在 PR 中说明改动动机、主要实现和验证结果。

## 许可证

本项目使用 [MIT License](./LICENSE)。
