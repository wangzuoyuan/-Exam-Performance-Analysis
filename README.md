# 成绩分析 Webapp

面向高中班主任的本地成绩分析 Web 应用。项目支持多场 Excel 成绩导入、跨学年学生画像、班级横向对比、重点关注名单，以及基于 LLM tool-use 的 AI 对话助手。

本项目已按 MIT License 开源，可自由使用、修改和二次分发。

## 功能特性

- **Excel 批量导入**：支持学生成绩明细表和班级均分表，自动从文件名识别年级、学期、考试类型和排序月份；上传时可逐文件确认并修正年级与考试年月，避免文件名识别错误。
- **高一 / 高二高三双口径**：高一支持主三门、五门、九门；高二高三支持主三门、+3、3+3 和选考等级分。
- **考试详情页**：展示班级均分、学生成绩明细、名次段分布、重点关注名单。
- **可自定义关注段位**：高分段 / 临界段 / 薄弱段的排名区间可自行调整，页面图表、历次趋势和 AI 问答口径同步生效。
- **历次段位趋势**：在考试详情页查看本班（或指定班级 / 全年级）三段人数随历次考试的变化趋势折线图。
- **学生画像页**：展示跨学年主三门趋势、五门趋势、+3 / 3+3 趋势、单科历史和历次考试明细。
- **班级对比页**：按总分或单科均分做多班横向对比，并高亮当前班级。
- **AI 对话助手**：支持 Anthropic Messages API 和 OpenAI Chat Completions 兼容接口，使用只读工具查询本地成绩数据后回答。
- **多场趋势分析**：AI 工具支持最近两次进退步，也支持最近 N 次或指定多场考试合并判断趋势排行。
- **本地单机部署**：数据库、上传文件和日志默认存放在用户目录 `~/.exam-tracker/`。
- **跨平台启动器**：`run.py` 统一封装 macOS / Windows 的初始化、启动和停止流程。

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
| 仪表盘 | `/` | 最近考试一览、班级动态、重点关注速览 |
| 数据上传 | `/upload` | 绑定班级、上传 Excel、查看解析结果 |
| 考试列表 | `/exam` | 已建档考试列表、搜索、删除误传考试 |
| 考试详情 | `/exam/[id]` | 班级均分表、学生成绩明细、名次段分布（可自定义段位 + 历次趋势）、重点关注 |
| 学生检索 | `/student` | 按姓名或学号查找学生画像 |
| 学生详情 | `/student/[id]` | 跨学年趋势、单科变化、历次考试明细 |
| 班级对比 | `/compare` | 多班总分 / 单科均分横向对比 |

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

## Excel 口径

| 项 | 高一 | 高二 / 高三 |
|----|------|-------------|
| 学科结构 | 9 科固定列 | 语数英 + 6 选 3 |
| 单科字段 | 分数、年级百分位 | 语数英：分数 / 百分位；选考：原始分 / 等级分 |
| 总分类型 | 主三门、五门、九门 | 主三门、+3、3+3 |
| 趋势口径 | 总分看学籍排名；单科看年级百分位 | 总分看学籍排名；语数英看年级百分位；选考单科看等级分 |
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

示例问题：

- `最近两次高一语文、数学、英语、主三门、五门分别进步最大的是谁？`
- `最近5次高一主三门和五门趋势最好的是谁？至少有3次成绩才算。`
- `高二语文退步最大的前10名是谁？`
- `这个学生整体情况怎么样？`
- `高一6班临界段人数最近几次考试是怎么变化的？`

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
│   │   └── chat/
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
