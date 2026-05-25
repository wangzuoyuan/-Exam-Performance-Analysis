# 成绩分析 Webapp

高中班主任成绩分析 Web 应用。支持多场考试成绩批量导入、跨学年学生画像、班级对比、重点关注名单，以及基于 LLM tool-use 的 AI 对话助手。

## 技术栈

- **后端**：Python 3.11+ / FastAPI / SQLAlchemy / SQLite
- **前端**：Next.js 14 (App Router) + TypeScript + Tailwind + Recharts + shadcn/ui
- **LLM**：支持官方 Anthropic API 及兼容 Anthropic Messages API 的第三方服务（tool use + SSE 流式）
- **部署**：本地单机，跨平台支持 macOS 与 Windows，启动后同时拉起后端 8000 + 前端 3000

## 首次安装

> 需要：Python 3.11+、Node.js 18+，macOS 或 Windows 10/11

**1. 克隆仓库**

```bash
git clone https://github.com/wangzuoyuan/-Exam-Performance-Analysis.git
cd -Exam-Performance-Analysis
```

**2. 配置 API Key**

复制 `backend/.env.example` 为 `backend/.env`，用文本编辑器填入 API Key。对话助手默认使用 Anthropic API，也支持切换为任意 OpenAI 兼容服务（见下方「对话助手配置」）。

**3. 初始化依赖**

- **macOS**：双击 `初始化成绩分析.command`
- **Windows**：双击 `初始化成绩分析.bat`（首次需安装 Python 3.11+ 时勾选「Add to PATH」，并安装 Node.js LTS）

脚本会自动创建 Python 虚拟环境并安装前端依赖。

**4. 启动应用**

- **macOS**：双击 `启动成绩分析.command`
- **Windows**：双击 `启动成绩分析.bat`

稍等片刻后浏览器会自动打开 http://localhost:3000。

---

## 日常使用

双击桌面/项目目录里的脚本即可：

| 操作 | macOS | Windows |
|------|-------|---------|
| 启动 | `启动成绩分析.command` | `启动成绩分析.bat` |
| 停止 | `停止成绩分析.command` | `停止成绩分析.bat` |
| 全新初始化（清空本地应用数据并重建依赖） | `初始化成绩分析.command` | `初始化成绩分析.bat` |

所有脚本底层都调用 `run.py`，也可直接命令行使用：

```bash
python run.py start    # 启动
python run.py stop     # 停止
python run.py init     # 全新初始化
```

> 「全新初始化」会清空 `~/.exam-tracker`（Windows 上是 `%USERPROFILE%\.exam-tracker`）下的数据库、上传文件和日志。

访问 http://localhost:3000

## 页面功能

| 页面 | 路由 | 功能 |
|------|------|------|
| 仪表盘 | `/` | 最近考试一览、班级动态 |
| 数据上传 | `/upload` | 上传 Excel，自动识别年级/考试类型 |
| 考试列表 | `/exam` | 已建档考试一览，支持搜索 + 删除上传错误的考试 |
| 考试详情 | `/exam/[id]` | 班级均分、分数段分布（并排柱状图）、重点关注 |
| 学生详情 | `/student/[id]` | 跨学年成绩画像、主三门趋势、+3/3+3 趋势、历次明细 |
| 班级对比 | `/compare` | 多班同次考试横向对比 |

## 目录结构

```
成绩分析webapp/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口，挂载三个 router
│   │   ├── db/models.py         # SQLAlchemy 模型（6 张表）
│   │   ├── ingest/              # 文件解析链路
│   │   │   ├── filename_parser.py   # 文件名 → 年级/学期/考试类型
│   │   │   ├── excel_parser.py      # 高一固定列 + 高二/三 3+3 选科结构
│   │   │   └── router.py            # 上传 API + 隐式班号初始化
│   │   ├── analysis/            # 读端计算层
│   │   │   ├── config.py            # 阈值配置（与 metric-definitions.md 同步）
│   │   │   ├── trends.py
│   │   │   ├── class_compare.py
│   │   │   ├── focus_list.py
│   │   │   ├── cross_year.py        # 跨学年趋势（只用主三门 + 语数英）
│   │   │   └── router.py            # 所有分析 API 端点
│   │   └── chat/                # AI 对话助手
│   │       ├── tools.py             # 10 个只读查询工具
│   │       ├── session.py           # SSE 流式调度 + 系统提示
│   │       └── config.py            # API Key / Base URL / 模型读取
│   ├── pyproject.toml
│   ├── .env                     # 对话助手 API 配置（不入库）
│   └── tests/
├── frontend/
│   ├── src/app/                 # Next.js App Router 页面
│   ├── src/components/
│   │   ├── ChatDrawer.tsx       # 对话抽屉（SSE 流式，全局 open-chat 事件触发）
│   │   ├── TrendLineChart.tsx   # 趋势折线图（Recharts 封装）
│   │   ├── RankBandStackedBar.tsx  # 名次段并排柱状图
│   │   ├── SubjectScatter.tsx   # 偏科散点图
│   │   └── ToolCallCard.tsx     # 工具调用折叠卡（对话抽屉内）
│   ├── package.json
│   └── tailwind.config.js
├── run.py                       # 跨平台启动器（start/stop/init），所有脚本最终都调它
├── start.sh                     # macOS 命令行启动入口
├── 启动成绩分析.command          # macOS 双击启动
├── 停止成绩分析.command          # macOS 双击停止
├── 初始化成绩分析.command        # macOS 双击全新初始化
├── 启动成绩分析.bat              # Windows 双击启动
├── 停止成绩分析.bat              # Windows 双击停止
└── 初始化成绩分析.bat            # Windows 双击全新初始化
```

## 数据模型（SQLite，存于 `~/.exam-tracker/db.sqlite`）

| 表 | 说明 |
|----|------|
| teacher | 单行表，记录目标班号（高一/高二/高三各一个字段） |
| exam | 考试档案（规范化考试名、年级、学期、考试类型） |
| upload | 原始上传记录（审计 + 重新解析） |
| subject_score | 长表：每生 × 每考 × 每科（raw_score / grade_score / grade_percentile） |
| total_score | 每生 × 每考 × 每种总分（主三门 / 五门 / 九门 / +3 / 3+3） |
| class_average | 各班均分（从班级均分表 Excel 提取） |

## 对话助手配置

对话助手读取 `backend/.env`，同时支持 **Anthropic Messages API** 和 **OpenAI Chat Completions API**（含任意兼容服务，如 DeepSeek / Qwen / Kimi / 自建 vLLM 等）。通过 `CHAT_PROVIDER` 切换：

```env
# === Anthropic 模式（默认） ===
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=           # 留空使用官方；填第三方兼容地址即可切换
ANTHROPIC_MODEL=claude-sonnet-4-6

# === OpenAI 兼容模式 ===
CHAT_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=              # 留空使用 api.openai.com；填兼容服务地址（含 /v1）
OPENAI_MODEL=gpt-4o-mini
```

两种模式共用同一套 tool-use 工具，前端无需改动。

## 对话工具集（10 个只读工具）

| Tool | 主要参数 | 用途 |
|------|----------|------|
| list_exams | grade?, year_range? | 罗列已建档考试 |
| student_lookup | name? / student_id? | 按姓名或学号定位学生 |
| student_exam_detail | student_id, exam_id | 某生某次考试完整成绩 |
| student_trend | student_id, total_type?, exam_ids? | 跨次总分趋势（跨学年自动退化为主三门） |
| student_learning_profile | student_id | 学生综合学情画像（优势/薄弱科/建议） |
| class_trend | class_num, metric, exam_ids? | 班级均分/排名时间序列 |
| compare_classes | class_nums[], exam_id, metric | 多班同次横向对比 |
| focus_list | exam_id, category? | 重点关注名单（临界段/薄弱段/偏科） |
| subject_weakness | class_num, exam_id | 全班单科薄弱清单 |
| subject_progress_ranking | exam_id, subject, grade?, class_num? | 某科进步/退步排行榜 |

## 高一 vs 高二/三 Excel 列结构

| 项 | 高一 | 高二/三（3+3） |
|----|------|---------------|
| 学科列 | 9 科 × 2 列（分数 + 百分位） | 语数英 3 列 + 6 门 × 2 列（原始 + 等级） |
| 总分类型 | 主三门 / 五门 / 九门 | 主三门 / +3 / 3+3 |
| 选科 | 全员同卷 | 6 选 3，未选列为空 |
| 等级分 | N/A | 40–70（计入高考总分） |

## 成绩口径说明

- **趋势主指标**：总分用学籍排名（xueji_rank）；单科用年级百分位（grade_percentile，越低越好）
- **高二/三 +3 选考**：趋势描述用等级分（grade_score），不用原始分或百分位
- **班级排名**：学生详情页按每场考试本班主三门实时计算
- **跨学年对比**：只允许使用主三门和语数英原始分，禁止使用九门或 +3 比较
- 阈值配置统一在 `analysis/config.py`，与 `exam-score-analysis/references/metric-definitions.md` 保持同步

## 开发命令

```bash
# 后端（带热重载）
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm run dev

# 前端类型检查
npx tsc --noEmit

# 后端测试
cd backend && pip install pytest && pytest tests/

# 关停服务（跨平台）
python run.py stop
```

日志写到 `~/.exam-tracker/{backend,frontend}.log`（Windows 上是 `%USERPROFILE%\.exam-tracker\`）。完全重置可双击对应平台的「初始化成绩分析」脚本，或手动删除该目录。
