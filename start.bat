@echo off
chcp 65001 >nul
title 璀璨宝石 Splendor 在线桌游
cd /d "%~dp0"
echo.
echo   正在启动璀璨宝石服务端...
echo   把稍后显示的「局域网访问」地址发给同事即可加入牌桌。
echo   按 Ctrl+C 停止。
echo.
node server.js
pause
