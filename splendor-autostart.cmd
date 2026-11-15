@echo off
REM Splendor: start the local server and the Cloudflare tunnel at logon.
timeout /t 15 /nobreak >nul
cd /d "D:\Splendor\"
powershell -NoProfile -ExecutionPolicy Bypass -File "start-all.ps1"
