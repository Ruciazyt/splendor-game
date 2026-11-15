@echo off
REM ==========================================================================
REM  璀璨宝石 · 通过 Cloudflare Tunnel 发布到公网（临时地址）
REM  用法： 1) 先运行 node server.js   2) 双击本文件
REM  控制台会打印一个 https://xxx.trycloudflare.com 地址，把它发给朋友即可。
REM  关闭本窗口 = 关闭公网入口。
REM ==========================================================================
setlocal
cd /d "%~dp0"
if not exist "tools\cloudflared.exe" (
  echo 未找到 tools\cloudflared.exe
  echo 请先下载：https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  pause
  exit /b 1
)
echo.
echo 正在连接 Cloudflare 边缘网络，请稍候...
echo.
tools\cloudflared.exe tunnel --no-autoupdate --protocol http2 --url http://localhost:3000
pause
