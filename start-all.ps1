<#
  璀璨宝石 · 启动（转发到 start-all.bat，功能完全一致）

  用法：双击 start-all.bat，或在 PowerShell 里执行：
      powershell -ExecutionPolicy Bypass -File start-all.ps1

  start-all.bat 会依次：
    1) 探测 :3000，没响应就启动 node server.js
    2) 探测命名隧道 splendor，没跑就用 %USERPROFILE%\.cloudflared\config.yml 启动 cloudflared
    3) 请求 https://game.ruciazyt.cn/health 自检公网是否可访问
#>
$ErrorActionPreference = 'Continue'
$bat = Join-Path $PSScriptRoot 'start-all.bat'
if (-not (Test-Path $bat)) { Write-Host ('找不到 ' + $bat) -ForegroundColor Red; exit 1 }
$line = '"' + $bat + '"'
if ($args.Count -gt 0) { $line = $line + ' ' + ($args -join ' ') }
& cmd /c $line
