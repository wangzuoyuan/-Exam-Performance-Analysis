#!/bin/bash
set -u

PORTS=(8000 3000)
stopped=0

echo "=== 成绩追踪 Web App 停止 ==="

for port in "${PORTS[@]}"; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    echo "端口 $port 未发现运行中的服务"
    continue
  fi

  echo "停止端口 $port 上的进程: $pids"
  kill $pids 2>/dev/null || true
  stopped=1
done

sleep 1

for port in "${PORTS[@]}"; do
  remaining="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$remaining" ]; then
    echo "端口 $port 仍有进程，强制停止: $remaining"
    kill -9 $remaining 2>/dev/null || true
  fi
done

echo ""
if [ "$stopped" -eq 1 ]; then
  echo "已停止成绩分析应用。"
else
  echo "没有发现需要停止的成绩分析服务。"
fi

echo ""
read -n 1 -s -r -p "按任意键关闭窗口..."
echo ""
