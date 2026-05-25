#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$HOME/.exam-tracker"
PORTS=(8000 3000)

echo "=== 成绩追踪 Web App 全新初始化 ==="
echo "这会清空本应用的本地数据库、已上传表格、日志和旧备份。"
echo "保留项目代码和 backend/.env 配置文件。"
echo ""

cd "$APP_DIR" || {
  echo "无法进入应用目录: $APP_DIR"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
  echo ""
  exit 1
}

echo "[1/5] 停止正在运行的服务..."
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "停止端口 $port 上的进程: $pids"
    kill $pids 2>/dev/null || true
  fi
done
sleep 1
for port in "${PORTS[@]}"; do
  remaining="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$remaining" ]; then
    echo "强制停止端口 $port 上的进程: $remaining"
    kill -9 $remaining 2>/dev/null || true
  fi
done

echo ""
echo "[2/5] 清空本地应用数据..."
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR/raw"

echo ""
echo "[3/5] 重建后端 Python 环境..."
cd "$APP_DIR/backend" || exit 1
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e .

echo ""
echo "[4/5] 重建前端 npm 环境..."
cd "$APP_DIR/frontend" || exit 1
rm -rf node_modules .next
npm install

echo ""
echo "[5/5] 检查脚本权限..."
cd "$APP_DIR" || exit 1
chmod +x ./start.sh
chmod +x ./启动成绩分析.command 2>/dev/null || true
chmod +x ./停止成绩分析.command 2>/dev/null || true
chmod +x ./初始化成绩分析.command 2>/dev/null || true

echo ""
echo "=== 全新初始化完成 ==="
echo "已清空: $DATA_DIR"
echo "已重建: backend/.venv"
echo "已重建: frontend/node_modules"
echo ""
echo "下一步可双击桌面的“启动成绩分析.command”启动一个干净的新应用。"
echo ""
read -n 1 -s -r -p "按任意键关闭窗口..."
echo ""
