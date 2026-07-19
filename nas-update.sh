#!/bin/sh
# 群晖 NAS 一键更新：备份数据库 → 拉取 GitHub 最新代码 → 重建容器 → 重启 caddy → 健康检查。
#
# 用法（在 NAS 上，普通用户即可，docker 步骤会自动 sudo 提权，按提示输密码）：
#   sh /volume1/docker/成绩分析docker/nas-update.sh
# 或先 chmod +x 后：
#   /volume1/docker/成绩分析docker/nas-update.sh
#
# 前提：该目录已是本仓库的 git 检出（origin=GitHub，分支 main）。

set -e

PROJECT_DIR="/volume1/docker/成绩分析docker"
PROJECT_NAME="grade_tracker"
DOCKER="/usr/local/bin/docker"

cd "$PROJECT_DIR"

echo "==> [1/5] 备份数据库 db.sqlite（升级前快照，迁移出意外可回退）"
DB="$PROJECT_DIR/data/db.sqlite"
if [ -f "$DB" ]; then
  BAK="$DB.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$DB" "$BAK"
  echo "    已备份 -> $BAK"
  # 只保留最近 10 份 .bak，避免占满磁盘（while 循环对空输入安全，不触发 set -e）
  ls -1t "$PROJECT_DIR"/data/db.sqlite.bak-* 2>/dev/null | tail -n +11 | while read -r f; do rm -f "$f"; done
else
  echo "    未发现 db.sqlite，跳过备份"
fi

echo "==> [2/5] 拉取最新代码 (git pull)"
# 透明代理环境下强制 HTTP/1.1，否则 git over HTTP/2 会无限挂死
git config http.version HTTP/1.1
git pull --ff-only origin main

echo "==> [3/5] 重建并启动容器（需 sudo，docker 守护进程要 root）"
sudo "$DOCKER" compose -p "$PROJECT_NAME" up -d --build

echo "==> [4/5] 重启 caddy（让它重新解析到新前端容器）"
sudo "$DOCKER" compose -p "$PROJECT_NAME" restart caddy

echo "==> [5/5] 健康检查"
# 首次启动时后端可能需要执行数据库迁移；给 Caddy 和后端最多 60 秒就绪时间，
# 避免固定等待 3 秒造成“容器正常、脚本误报失败”。
HEALTH_URL="http://localhost:8080/api/health"
HEALTH_ATTEMPTS=30
HEALTH_DELAY=2
attempt=1

while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
  if sudo "$DOCKER" exec "${PROJECT_NAME}-caddy-1" wget -qO- -T 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✅ 更新完成，服务健康。外网访问 https://meng5638.asuscomm.com:9500"
    exit 0
  fi

  echo "    等待服务就绪（$attempt/$HEALTH_ATTEMPTS）..."
  sleep "$HEALTH_DELAY"
  attempt=$((attempt + 1))
done

echo "⚠️ 60 秒内健康检查仍未通过，当前容器状态和最近日志如下："
sudo "$DOCKER" compose -p "$PROJECT_NAME" ps || true
sudo "$DOCKER" compose -p "$PROJECT_NAME" logs --tail 50 || true
exit 1
