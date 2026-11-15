@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 璀璨宝石 · 启动本地服务

echo.
echo   璀璨宝石 · 启动中
echo   ----------------------------------------

REM ---- 1) 本地服务端 -------------------------------------------------
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 goto START_SERVER
echo   [1/2] 本地服务端已在运行（:3000）
goto CHECK_TUNNEL

:START_SERVER
echo   [1/2] 启动本地服务端...
start "璀璨宝石服务端" /min cmd /c "node server.js"
ping -n 4 127.0.0.1 >nul
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 goto SERVER_FAIL
echo         服务端已就绪  http://localhost:3000
goto CHECK_TUNNEL

:SERVER_FAIL
echo         服务端启动失败，请确认 node 已安装并在 PATH 中

REM ---- 2) 公网隧道（可选，默认不启动） --------------------------------
REM   正式部署在云服务器上，用 IP:端口 访问；本机隧道只作备用。
REM   需要时用 start-all.bat tunnel 启动命名隧道（game.ruciazyt.cn）。
:CHECK_TUNNEL
if /i "%~1"=="tunnel" goto START_TUNNEL
echo   [2/2] 跳过本机公网隧道（正式地址为云服务器 IP:3000）
goto DONE_INFO

:START_TUNNEL
tasklist /fi "imagename eq cloudflared.exe" | findstr /i "cloudflared" >nul
if not errorlevel 1 goto TUNNEL_OK
if not exist "tools\cloudflared.exe" goto NO_TUNNEL_EXE
if not exist "%USERPROFILE%\.cloudflared\config.yml" goto NO_TUNNEL_CFG
echo   [2/2] 启动 Cloudflare 隧道...
start "璀璨宝石隧道" /min cmd /c "tools\cloudflared.exe tunnel --no-autoupdate --protocol http2 --config %USERPROFILE%\.cloudflared\config.yml run splendor >> tools\tunnel.named.log 2>&1"
ping -n 7 127.0.0.1 >nul
:TUNNEL_OK
echo   [2/2] 公网隧道已在运行

:NO_TUNNEL_EXE
echo   [2/2] 未找到 tools\cloudflared.exe，跳过公网隧道
goto DONE_INFO

:NO_TUNNEL_CFG
echo   [2/2] 缺少隧道配置 %USERPROFILE%\.cloudflared\config.yml
echo         先执行一次 tools\deploy\deploy-tunnel.ps1 创建隧道

:DONE_INFO
echo   ----------------------------------------
ping -n 2 127.0.0.1 >nul
echo   本机地址： http://localhost:3000
echo   云服务器： http://124.221.228.93:3000
echo.
if /i "%~1"=="nopause" goto DONE
pause
:DONE
endlocal
