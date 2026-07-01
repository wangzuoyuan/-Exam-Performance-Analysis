# NAS 升级步骤（分两步：先作业跟踪 v1.0.0，再换届 v1.1.0）

> 目标：把 NAS 上的旧版（无作业跟踪）分两步升到最新，**存量数据全程保留**。
> 数据存在 `./data`（Docker bind mount），在 git 仓库之外，`git`/`--build` 都不碰它。
> 每步都：**先备份 → 切到对应 release tag → 重建容器 → 验证**。

约定（按你的实际情况改）：
- 项目目录：`/volume1/docker/成绩分析docker`（记作 `$DIR`）
- compose 项目名：`grade_tracker`（中文目录必须带 `-p grade_tracker`）
- docker：`/usr/local/bin/docker`（记作 `$DOCKER`）
- 对外地址：用你自己的（如 `https://meng.zuoyuan.wang:9500`）

---

## 步骤 0 · 先搞清楚 NAS 现在是怎么部署的

SSH 登录 NAS，然后：

```sh
DIR=/volume1/docker/成绩分析docker      # 改成你的实际路径
cd "$DIR"
ls -la                                  # 看有没有 docker-compose.yml / .git / data 目录
git rev-parse --short HEAD 2>/dev/null && echo "→ 这是 git 检出" || echo "→ 不是 git 检出（可能是 tar 镜像部署）"
sudo /usr/local/bin/docker ps           # 看现在跑着哪些容器（grade_tracker-*）
```

- **情况 A：是 git 检出**（有 `.git`，`git rev-parse` 出 commit）→ 直接按下面「步骤 1/2」走。
- **情况 B：不是 git 检出**（tar 镜像部署，无 `.git`）→ 先做「附录 · 从镜像部署迁到 git 部署」，再回来走步骤 1/2。

> 判断依据：Docker 支持是 e9a0136 才加的，作业跟踪更早（14a8ed5）。如果你现在跑着 Docker 却没有作业跟踪，很可能是**早期用 `成绩分析docker.tar.gz` 镜像部署**的，属情况 B。

---

## 步骤 0.5 · 备份数据（务必做）

```sh
cd "$DIR"
sudo cp -a ./data "./data.bak-$(date +%Y%m%d-%H%M)"    # 整目录快照
ls -la ./data.bak-*                                     # 确认备份在
```

（也可以在网页里「数据备份 → 立即备份」再下载一份，双保险。）

---

## 步骤 1 · 升到 v1.0.0（拿到作业跟踪）

```sh
cd "$DIR"
git config http.version HTTP/1.1        # 透明代理环境防止 git over HTTP/2 挂死
git fetch origin --tags
git checkout v1.0.0                      # 精确切到这个 release（不是 pull main）

sudo /usr/local/bin/docker compose -p grade_tracker up -d --build
sudo /usr/local/bin/docker compose -p grade_tracker restart caddy
```

**验证（关键）**：
```sh
sleep 3
sudo /usr/local/bin/docker exec grade_tracker-caddy-1 wget -qO- http://localhost:8080/api/health   # 期望 {"ok":true,...}
```
再打开网页确认：① 侧栏出现「**作业跟踪**」入口；② **原有成绩/学生数据还在**（考试列表、学生检索照旧）。
数据没丢、作业跟踪能进，这步就算成功。

---

## 步骤 2 · 升到 v1.1.0（班主任版·升级换届）

确认第 1 步没问题后再做这步。

```sh
cd "$DIR"
git fetch origin --tags
git checkout v1.1.0

sudo /usr/local/bin/docker compose -p grade_tracker up -d --build
sudo /usr/local/bin/docker compose -p grade_tracker restart caddy
sleep 3
sudo /usr/local/bin/docker exec grade_tracker-caddy-1 wget -qO- http://localhost:8080/api/health
```

后端启动时会**自动**跑 `migrate_homeroom`（只新增身份表/`class_roster.grade` 列、回填年级，不动存量数据）。
可看一眼迁移日志确认：
```sh
sudo /usr/local/bin/docker compose -p grade_tracker logs backend | grep migrate_homeroom | tail -1
# 形如：[migrate_homeroom] created=[...] added_grade_column=True backfilled=N active_grade=1 ...
```
**验证**：网页侧栏出现「**升级换届**」入口；上传高二成绩后能进换届向导；老数据仍在。

---

## 回退（万一某步不对）

```sh
cd "$DIR"
git checkout v1.0.0                      # 或上一个正常的 tag
sudo cp -a "./data.bak-YYYYmmdd-HHMM/." ./data/    # 需要时用备份覆盖回数据
sudo /usr/local/bin/docker compose -p grade_tracker up -d --build
sudo /usr/local/bin/docker compose -p grade_tracker restart caddy
```

---

## 以后每次更新（给你的「可复用打包」流程）

- 我这边：每次改完 → 合并进 `main` → 打一个 `vX.Y.Z` tag + GitHub Release（就是这次这样）。
- 你这边（**推荐·一键**）：在 NAS 上跑 `sh /volume1/docker/成绩分析docker/nas-update.sh`，按提示输密码。
  它会依次：**自动备份 `db.sqlite`（保留最近 10 份）** → `git pull` main → 重建容器 → 重启 caddy → 健康检查。
- 你这边（想手动等价操作）：
  ```sh
  cd "$DIR"
  cp -a data/db.sqlite "data/db.sqlite.bak-$(date +%Y%m%d-%H%M)"   # 脚本已自动做，手动时别忘
  git checkout main && git pull --ff-only origin main
  sudo /usr/local/bin/docker compose -p grade_tracker up -d --build && \
  sudo /usr/local/bin/docker compose -p grade_tracker restart caddy
  ```
- 你这边（想按版本走）：把上面的 `git pull` 换成 `git fetch --tags && git checkout vX.Y.Z`。

> 注意：`git checkout <tag>` 会进入 detached HEAD，用 `nas-update.sh`（它 `git pull origin main`）前先 `git checkout main`。

---

## 附录 · 情况 B：从「镜像 tar 部署」迁到「git 部署」

如果步骤 0 判定不是 git 检出，先把 NAS 换成 git 部署（一次性），数据照旧：

```sh
# 1) 找到旧数据目录（旧容器挂载的 db.sqlite 所在），记为 $OLDDATA
sudo /usr/local/bin/docker inspect <旧backend容器名> | grep -A3 Mounts   # 看它的数据卷路径

# 2) 新建 git 部署目录并克隆
sudo mkdir -p /volume1/docker/成绩分析docker && cd /volume1/docker/成绩分析docker
git config --global http.version HTTP/1.1
git clone https://github.com/wangzuoyuan/-Exam-Performance-Analysis .
git checkout v1.0.0

# 3) 把旧数据搬进来（保留！）
sudo mkdir -p ./data
sudo cp -a "$OLDDATA/." ./data/          # db.sqlite / backups / homework_exports 等
# 4) 配置 backend/.env（APP_PASSWORD / PUBLIC_HOST / 对话 key），参考 DEPLOY.md

# 5) 停掉旧容器，起新栈
sudo /usr/local/bin/docker stop <旧容器>
sudo /usr/local/bin/docker compose -p grade_tracker up -d --build
sudo /usr/local/bin/docker compose -p grade_tracker restart caddy
```
之后就能走上面的步骤 1/2 了。**动手前先把 `$OLDDATA` 备份一份。**
</content>
