@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 璀璨宝石 · 部署到云服务器
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\deploy\deploy.ps1"
echo.
pause
