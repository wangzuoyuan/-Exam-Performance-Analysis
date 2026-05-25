#!/bin/bash
set -e

WEBAPP_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAM_TRACKER_DIR="${HOME}/.exam-tracker"
mkdir -p "$EXAM_TRACKER_DIR/raw"

# 端口检测
check_port() {
    lsof -i :$1 > /dev/null 2>&1
}

echo "=== 成绩追踪 Web App 启动 ==="

if check_port 8000; then
    echo "[警告] 端口 8000 已被占用，后端可能已在运行"
else
    echo "[1/3] 启动 FastAPI 后端 (localhost:8000)..."
    cd "$WEBAPP_DIR/backend"
    source .venv/bin/activate 2>/dev/null || python3 -m venv .venv && source .venv/bin/activate
    pip install -e . > /dev/null 2>&1
    python3 - <<PY
import subprocess
from pathlib import Path

backend_dir = Path("$WEBAPP_DIR/backend")
log_path = Path("$EXAM_TRACKER_DIR/backend.log")
log = log_path.open("ab", buffering=0)
subprocess.Popen(
    ["bash", "-lc", "source .venv/bin/activate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"],
    cwd=backend_dir,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
PY
    sleep 2
fi

if check_port 3000; then
    echo "[警告] 端口 3000 已被占用，前端可能已在运行"
else
    echo "[2/3] 启动 Next.js 前端 (localhost:3000)..."
    cd "$WEBAPP_DIR/frontend"
    python3 - <<PY
import subprocess
from pathlib import Path

frontend_dir = Path("$WEBAPP_DIR/frontend")
log_path = Path("$EXAM_TRACKER_DIR/frontend.log")
log = log_path.open("ab", buffering=0)
subprocess.Popen(
    ["npm", "run", "dev"],
    cwd=frontend_dir,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
PY
    sleep 3
fi

echo "[3/3] 打开浏览器..."
sleep 1
open http://localhost:3000

echo ""
echo "=== 启动完成 ==="
echo "后端: http://localhost:8000"
echo "前端: http://localhost:3000"
echo ""
echo "关闭服务: kill \$(lsof -t -i:8000) \$(lsof -t -i:3000)"
