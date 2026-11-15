@echo off
REM 一键打包：生成 splendor-web.zip（内容根 = 项目根）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1"
pause