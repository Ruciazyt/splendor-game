@echo off
REM Splendor: start the local server and the Cloudflare tunnel at logon.
timeout /t 15 /nobreak >nul
cd /d "C:\\Users\\WINDOWS\\.minimax\\sessions\\mvs_fd4c431d9b58403292d62122780edc71\\workspace\\"
powershell -NoProfile -ExecutionPolicy Bypass -File "start-all.ps1"
