# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本文件是 webapp 目录的补充说明。父目录 CLAUDE.md（`../CLAUDE.md`）含架构总览和业务口径，两者都会加载，本文件只记录 webapp 特有细节和对父文件的修正。

## 快速命令

跨平台启动器在 `run.py`，所有 `.sh / .command / .bat` 双击入口都委托给它。日常开发优先用 `python run.py <子命令>`，macOS / Windows 行为一致。

```bash
# 一键启动后端 8000 + 前端 3000（跨平台）
python run.py start
./start.sh                       # macOS 命令行等价

# 重启（改代码后必须先停，启动器检测到端口占用会跳过启动）
python run.py stop && python run.py start

# 完全重置（清空 ~/.exam-tracker/，Windows 上是 %USERPROFILE%\.exam-tracker\）
python run.py init

# 后端（带 reload，单独开发用）
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm run dev          # localhost:3000
npx tsc --noEmit                    # 类型检查
npm run build                       # 生产构建（CI 没配，靠这个兜底）

# 后端测试
cd backend && source .venv/bin/activate && pip install pytest && pytest tests/
pytest tests/test_excel_parser.py::test_xxx  # 单个用例

# 日志
tail -f ~/.exam-tracker/backend.log
tail -f ~/.exam-tracker/frontend.log
```

## API 端点一览

### ingest router（`/api`）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传 Excel，返回解析结果 + 候选班号 |
| GET  | `/api/uploads` | 上传历史 |

### analysis router（`/api`）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/exams` | 考试列表，支持 `?grade=` 筛选 |
| DELETE | `/api/exams/{id}` | 删除考试及所有关联数据（级联） |
| GET  | `/api/exams/{id}` | 考试详情：含 `students[]`、`rank_bands`、`rank_distribution`、`class_averages`、`stats` |
| GET  | `/api/focus-list/{id}` | 重点关注名单（临界段/薄弱段/严重偏科），支持 `?class_num=` |
| GET  | `/api/students/{id}` | 学生跨学年画像：含 `main_total_trend`（每项含 `class_rank`）、`five_trend`、`plus3_trend`、`san3_trend`、`subject_trend` |
| GET  | `/api/class/compare` | 班级横向对比，支持 `?exam_id=` |
| GET  | `/api/subject-weakness/{id}` | 单科薄弱名单，支持 `?class_num=` |

### chat router（`/api`）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | SSE 流式，支持 Anthropic 和 OpenAI 兼容两种 provider |
| GET  | `/api/chat/config` | 返回当前 LLM 配置（provider / model，不暴露 key） |

## 对话工具集（10 个只读工具，`chat/tools.py`）

`list_exams` / `student_lookup` / `student_exam_detail` / `student_trend` / `student_learning_profile` / `class_trend` / `compare_classes` / `focus_list` / `subject_weakness` / `subject_progress_ranking`

新增工具只需在 `tools.py` 里添加函数并注册到工具列表，`session.py` 自动调度。

## 数据流关键路径

**上传链路**：`ingest/router.py` → `filename_parser.py`（文件名解析年级/学期/考试类型）→ `excel_parser.py`（解析 Excel，高一固定列 vs 高二/三 3+3 两种 schema）→ 写入 6 张 SQLite 表。首次上传后弹窗确认班号 → `POST /api/teacher/bind-class`。

**读端链路**：`analysis/router.py` 直接用 SQLAlchemy 查询，**没有使用** `analysis/trends.py` / `class_compare.py` / `focus_list.py` / `cross_year.py` 这些计算模块（它们是早期抽象，当前 router 内联了逻辑）。改查询逻辑只需改 `router.py`。

## 前端开发要点

- **新增页面**：不要加 `<header>` / `max-w-*` / `min-h-screen` / `bg-slate-50`，`Shell.tsx` 已接管布局。
- **shadcn 组件**：`npx shadcn@latest add <name>`（包名是 `shadcn`，不是 `shadcn-ui`）。
- **颜色 token**：统一用 tailwind.config.js 的 `brand-*` / `success` / `warning` / `danger`；Recharts 内直接写字符串（它不接受 CSS 变量）。
- **ChatDrawer 触发**：通过 `window.dispatchEvent(new Event('open-chat'))` 打开，不要直接 import/ref。
- **缺考字段**：API 返回 `null`，前端一律显示 `"—"`，不要显示 `0`。

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

有测试：`api` / `chat_config` / `chat_tools` / `db` / `excel_parser` / `filename_parser`

**无测试**：`analysis/router.py` 的计算逻辑（trends / class_compare / focus_list / cross_year 模块同样无测试）。
