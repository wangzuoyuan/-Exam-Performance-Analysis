#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$APP_DIR" || {
  echo "无法进入应用目录: $APP_DIR"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
  echo ""
  exit 1
}

if [ ! -x "./start.sh" ]; then
  chmod +x "./start.sh"
fi

./start.sh
status=$?

echo ""
if [ "$status" -eq 0 ]; then
  echo "可以关闭这个窗口，成绩分析应用会继续在后台运行。"
else
  echo "启动失败，退出码: $status"
  echo "可查看日志:"
  echo "  $HOME/.exam-tracker/backend.log"
  echo "  $HOME/.exam-tracker/frontend.log"
fi

echo ""
read -n 1 -s -r -p "按任意键关闭窗口..."
echo ""
exit "$status"
