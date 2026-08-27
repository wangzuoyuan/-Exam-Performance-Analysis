# 部署到群晖 NAS（DDNS 公网访问）

把这套「成绩 + 作业 + 档案」应用部署到群晖 NAS，常驻运行，手机/电脑在家或在外都能用。

## 访问模型一句话

- **内网**（同 WiFi）：浏览器开 `http://NAS局域网IP:8080` → **免登录**直接用。
- **外网**（在外面）：浏览器开 `https://你的域名.synology.me` → **要输密码** + 全程 HTTPS。

判定靠请求的域名：命中你配置的 `PUBLIC_HOST`（DDNS 域名）才要求登录；内网用 IP 进来不需要。路由器只把 443 转发给 NAS，8080 不对外转发，所以内网入口只在家里能到。

```
外网手机/电脑                          内网手机/电脑（同 WiFi）
  │ https://xxx.synology.me            │ http://NAS-IP:8080
  ▼                                     │
路由器 443 → NAS:443                     │
  ▼                                     │
DSM 反向代理（TLS, synology.me 证书）    │
  │ http://localhost:8080               │
  ▼                                     ▼
        Caddy 容器（发布 0.0.0.0:8080）
          ├ /api/* → backend:8000   （含 AI 聊天 SSE）
          ├ /mcp/* → backend:8000   （只读 MCP 服务端，可选，默认关闭）
          └ /*     → frontend:3000
                     backend → /data/db.sqlite（挂载卷）
```

---

## 一、前置确认

1. 群晖型号支持 **Container Manager**（套件中心能搜到即可，绝大多数 Plus 系列都行）。
2. 内存建议 ≥ 2GB。若是低端 ARM / 内存紧张机型，前端镜像在 NAS 上构建可能失败 —— 改在 Mac 上构建后导入（见文末「附：低配机型」）。

## 二、放代码 + 数据

1. 把本项目（`成绩分析docker/` 整个目录）传到 NAS 共享文件夹，例如 `/volume1/docker/exam-tracker/`。
2. 在项目根目录下建数据目录并放入现有数据库：
   - 新建 `data/` 子目录。
   - 把 Mac 上的 `~/.exam-tracker/db.sqlite` 拷进 `data/db.sqlite`。
   - 如需保留历史导出，把 `~/.exam-tracker/homework_exports/` 一并拷进 `data/homework_exports/`。
   - 没有旧数据就跳过，应用首次启动会自动建空库。

> 小贴士：先在 Mac 上用应用里的「数据备份」生成 zip，解压后把 `db.sqlite` 放进 `data/` 最稳妥。

## 三、填密钥与密码

复制 `backend/.env.example` 为 `backend/.env`，填：

```env
CHAT_PROVIDER=...            # 你现在用的（如 GLM 走 openai 兼容）
OPENAI_API_KEY=...           # 或 ANTHROPIC_API_KEY，照搬 Mac 上的 .env
OPENAI_BASE_URL=...
OPENAI_MODEL=...

APP_PASSWORD=换成你的强密码    # ← 外网登录密码，必填
PUBLIC_HOST=xxx.synology.me   # ← 你的 DDNS 域名，必填
# SESSION_SECRET 留空即可（自动生成并持久化）
```

> `backend/.env` 含密码与 key，**不要提交到任何代码仓库**（已在 .gitignore）。

## 四、起服务（Container Manager）

1. Container Manager → **项目** → 新增 → 选择项目根目录的 `docker-compose.yml` → 构建。
2. 首次构建前端镜像需要几分钟（npm 安装 + 构建），耐心等。
3. 起来后，**在家**用电脑浏览器开 `http://NAS局域网IP:8080`：
   - 能看到看板、且**不需要密码** → 内网链路通。
   - 数据是你导入的那份 → 卷挂载正确。

命令行等价（SSH 到 NAS，在项目根目录）：

```bash
sudo docker compose -p grade_tracker up -d --build
sudo docker compose -p grade_tracker logs -f        # 看日志
sudo docker compose -p grade_tracker down           # 停
```

> **为什么必须带 `-p grade_tracker`**：本项目 NAS 目录名含中文（`/volume1/docker/成绩分析docker`），compose 缺省会用目录名当项目名，裸跑会另建一套平行容器（端口冲突、数据错位）。统一用 `-p grade_tracker`（与 `nas-update.sh` 里的 `PROJECT_NAME` 同值）。

## 五、DDNS + 证书（DSM）

1. **控制面板 → 外部访问 → DDNS** → 新增，服务商选 Synology，注册一个 `xxx.synology.me` 主机名（与 `.env` 里 `PUBLIC_HOST` 一致）。勾「获取 Let's Encrypt 证书」。
2. 若没自动签发：**控制面板 → 安全性 → 证书** → 新增 → 用 `xxx.synology.me` 申请。

## 六、反向代理（DSM）

**控制面板 → 登录门户 → 高级 → 反向代理 → 新增**，一条规则即可：

| 项 | 值 |
|----|----|
| 来源 协议 | HTTPS |
| 来源 主机名 | `xxx.synology.me` |
| 来源 端口 | 443 |
| 目标 协议 | HTTP |
| 目标 主机名 | `localhost` |
| 目标 端口 | `8080` |

- 「自定义标头」可加 `WebSocket`（聊天 SSE 不强制要，但加上无害）。
- 在「安全性」勾 HSTS。

## 七、路由器端口转发

把路由器（光猫/主路由）的外部 **443** 转发到 **NAS 的 443**。只开这一个端口；**8080 不要转发**。

> 家用宽带若是公网 IP 才能直连；若运营商给的是大内网 IP，DDNS 解析不到你家，需要联系运营商开公网 IP 或改用其它穿透方式。

## 八、验收

1. 内网：`http://NAS-IP:8080` → 免密、数据正确。
2. 外网：手机**关掉 WiFi 用流量**开 `https://xxx.synology.me`：
   - 浏览器锁形图标正常（HTTPS 证书有效）。
   - 出现登录页 → 输 `APP_PASSWORD` → 进入。
   - 看板 / 录入缺交 / 学生档案 / AI 聊天 / 家长会一页纸打印逐项点一遍。

---

## 九、只读 MCP 服务端（可选，供笔记本 Hermes 等远程 AI 客户端）

后端内置只读 MCP 服务端（Streamable HTTP，stateless JSON），挂载路径 `/mcp`，经 Caddy 与现有 `/api` 一起转发（`Caddyfile` 已加 `/mcp` 与 `/mcp/*` → `backend:8000` 两条路由，不影响 `/api` SSE、前端、端口、卷和服务名）。**公网使用必须 HTTPS**（Bearer Token 明文传输只有 TLS 保护；路由器/DSM 反代已提供）。默认关闭；关闭时后端完全不挂载 `/mcp`、不导入 mcp SDK，行为与之前一致。

> **compose 透传说明**：`docker-compose.yml` 的 backend 服务用 `env_file: ./backend/.env` 整体透传环境变量，因此 MCP 的全部配置（`MCP_ENABLED` / `MCP_BEARER_TOKEN` / `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS`）只需写进 `backend/.env`，**无需改 compose**。改完后按第 3 节步骤带项目名更新 backend 并重启 caddy（`sudo docker compose -p grade_tracker up -d --build backend` + `sudo docker compose -p grade_tracker restart caddy`）。

### 1. 生成 Token（只在终端做，不要写进仓库/截图/工单）

```bash
openssl rand -hex 32
# 输出 64 位十六进制随机串 —— 那就是你的 token（不要抄任何示例值，用你自己生成的）
# macOS/Linux 无 openssl 时可用：python3 -c 'import secrets; print(secrets.token_hex(32))'
```

班主任版与任课教师版（教学版）各自独立生成、独立保存，**不要共用 token**。

### 2. 配置 `backend/.env`（NAS 项目目录：`/volume1/docker/成绩分析docker/backend/.env`）

```dotenv
MCP_ENABLED=true
MCP_BEARER_TOKEN=<把上面命令的输出粘到这里>
# Host 白名单：必须包含你的公网域名（bare 与带端口两种写法都列上）；缺省仅 localhost，公网会 421。
# 班主任版公开域名示例：grade.zuoyuan.wang:9500
MCP_ALLOWED_HOSTS=grade.zuoyuan.wang,grade.zuoyuan.wang:*,grade.zuoyuan.wang:9500,localhost:8000
# Origin 白名单：仅浏览器跨域访问才需要；Hermes/curl 等非浏览器客户端不带 Origin，天然放行。可留空用缺省（localhost）。
MCP_ALLOWED_ORIGINS=
```

说明：`MCP_BEARER_TOKEN` 缺失、空白、弱占位符（如 `changeme`/`123456`）或短于 32 字符时，**后端启动直接失败**（fail closed，宁可不服务也不裸奔）。轮换 token：生成新值 → 替换 `.env` → 重启 backend，旧 token 立即失效。

### 3. 重建 / 重启（本次升级必做：backend 与 caddy 都要更新）

本次升级同时变更了 **backend 镜像内容**（新增 MCP 服务端 + `mcp` 依赖）和 **`Caddyfile`**（新增 `/mcp` 与 `/mcp/*` 路由），两个容器都必须更新，缺一步就会运行旧路由或旧后端（数据卷、服务名、端口均不变）。在 NAS 项目目录依次执行：

```bash
cd /volume1/docker/成绩分析docker   # 你的项目目录

# ① 重建并启动 backend（本仓库是 build 型 compose；含新增 mcp 依赖）
sudo docker compose -p grade_tracker up -d --build backend

# ② 重启 caddy 加载新 Caddyfile（/mcp 路由必须重启才生效，必做）
sudo docker compose -p grade_tracker restart caddy

# ③ 确认三个容器都在运行（backend / frontend / caddy 状态均应为 Up）
sudo docker compose -p grade_tracker ps

# ④ 看 backend 日志：确认无 MCP 配置错误（fail closed 时会在此报 MCPConfigError）
sudo docker compose -p grade_tracker logs --tail=50 backend

# ⑤ 健康检查（前端经 caddy 到 backend 的既有链路不受影响）
curl -f http://127.0.0.1:8080/api/health
```

### 4. 公网 URL

MCP 端点（**规范验证 URL，带尾斜杠**）：`https://grade.zuoyuan.wang:9500/mcp/`（Caddy 已把 `/mcp` 及子路径转发到 backend；不影响 `/api` 与前端）。

> 说明：访问不带尾斜杠的 `/mcp` 会被 FastAPI mount 以 **307 重定向**到 `/mcp/`。Hermes 与 `curl -L` 会自动跟随，功能不受影响；但手工验证时请直接用 `/mcp/`，否则不带 `-L` 的 curl 看到的是 307 而非 401/200。

### 5. Hermes 笔记本端配置（与任课教师版并存）

Hermes 读取 `~/.hermes/config.yaml`，在**顶层** `mcp_servers` 下加一段（HTTP Streamable 只需 `url` + `headers`，可加超时；**不需要** `type`/`transport` 字段）。班主任版连接 key 用 `homeroom_grade_tracker`：

```yaml
mcp_servers:
  homeroom_grade_tracker:
    url: "https://grade.zuoyuan.wang:9500/mcp/"
    headers:
      Authorization: "Bearer <班主任版独立token>"
    timeout: 120
    connect_timeout: 60
```

已有的任课教师版配置原样保留，两者 token 独立：

```yaml
mcp_servers:
  grade_tracker:
    url: "https://<任课教师版域名>/mcp/"
    headers:
      Authorization: "Bearer <任课教师版独立token>"
    timeout: 120
    connect_timeout: 60
```

改完**重启 Hermes**；交互会话中也可执行 `/reload-mcp` 热加载。连接成功后，工具分别以 **`mcp_homeroom_grade_tracker_`** 与 **`mcp_grade_tracker_`** 前缀出现（如 `mcp_homeroom_grade_tracker_student_learning_profile`）—— 前缀来自**连接 key**（客户端命名空间要求），服务端不给工具改名、不建重复别名。

**两个应用怎么选**（写给 Hermes 里的 AI / 自己记）：

- 提到 **班主任、行政班、全科、总分、综合画像、作业/谈话档案** → 用班主任版（`mcp_homeroom_grade_tracker_*`）
- 提到 **任课老师、教学班、任教学科、单科** → 用任课教师版（`mcp_grade_tracker_*`）

> 提示：Hermes 运行环境需已安装 `mcp` Python 包（`pip install "mcp>=2"`）。token 等同全量只读学情权限，不要提交到 git。

### 6. 验证（规范 URL 一律用 `/mcp/`，避免被 307 重定向掩盖）

```bash
# ① 无 token → 401 + WWW-Authenticate: Bearer
curl -i -X POST https://grade.zuoyuan.wang:9500/mcp/ \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# ② 正确 token → initialize
curl -s -X POST https://grade.zuoyuan.wang:9500/mcp/ \
  -H 'Authorization: Bearer <你的token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# ③ tools/list（应恰好返回注册表中全部 20 个只读工具）
curl -s -X POST https://grade.zuoyuan.wang:9500/mcp/ \
  -H 'Authorization: Bearer <你的token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# ④ 一次真实 tool call
curl -s -X POST https://grade.zuoyuan.wang:9500/mcp/ \
  -H 'Authorization: Bearer <你的token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_exams","arguments":{}}}'
```

或用 MCP Inspector 图形化验证：`npx @modelcontextprotocol/inspector`，Transport 选 Streamable HTTP，URL 填 `https://grade.zuoyuan.wang:9500/mcp/`，Authentication 填 Bearer token。

笔记本端 Hermes 也可直接用自带 `test` 子命令自检连接（配置好 `~/.hermes/config.yaml` 后执行）：

```bash
hermes mcp test homeroom_grade_tracker
```

最终以 Hermes 实际调用为准：重启 Hermes（或会话内 `/reload-mcp`）后，直接用自然语言让 AI 调 `mcp_homeroom_grade_tracker_list_exams`（如「用班主任版列一下已建档考试」），确认返回真实数据。

### 7. 安全边界

- **Bearer Token = 全量只读学情数据权限**：含全部学生成绩、排名、缺交记录、谈话/成长档案。谁能拿到 token 谁就能读所有数据，按密码等级保管。
- **必须 HTTPS**：仅通过 DSM 反代/HTTPS 域名暴露；不要把 8080 端口直接映射公网。
- **防泄漏**：token 只存 NAS 的 `backend/.env`（已入 `.gitignore`）与笔记本 Hermes 配置；不要写进 README、工单、截图、日志。后端 401/错误响应不含 token。
- **轮换**：怀疑泄漏立即 `openssl rand -hex 32` 换新并重启；旧 token 即刻失效。
- **Host/Origin 防护**：MCP SDK 默认拒绝白名单外 Host（421）与 Origin（403）。公网部署必须把域名加进 `MCP_ALLOWED_HOSTS`；浏览器访问才需配 Origin。
- **只读保证**：MCP 目录只含注册表 `read_only: True` 的工具且经 `execute_tool` 分发；未来写入类工具不会自动暴露。

---

## 日常维护

- **改了代码**：重新 `docker compose -p grade_tracker up -d --build`。
- **数据备份**：`data/` 目录就是全部数据，纳入群晖 Hyper Backup / 快照即可；应用内「数据备份」生成的 zip 在 `data/backups/`。
- **换密码**：改 `backend/.env` 的 `APP_PASSWORD`，重启 backend 容器。

## 附：低配 / ARM 机型（NAS 上构建前端失败时）

在 Mac 上构建好镜像再导入 NAS：

```bash
# Mac 上（指定 NAS 的架构，Intel 群晖用 amd64，ARM 群晖用 arm64）
cd 成绩分析docker
docker buildx build --platform linux/amd64 -t exam-backend ./backend
docker buildx build --platform linux/amd64 -t exam-frontend ./frontend
docker save exam-backend exam-frontend -o exam-images.tar
# 把 exam-images.tar 传到 NAS，Container Manager → 映像 → 新增 → 从文件添加
# 然后把 compose 里 backend/frontend 的 build: 换成 image: exam-backend / exam-frontend
```
