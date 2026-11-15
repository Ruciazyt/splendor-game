# ============================================================================
#  一键部署：本地仓库 -> 云服务器
#
#  用法：
#    1) 双击根目录 deploy.bat（会提示输入服务器密码，输入时不回显）
#    2) 或 powershell -NoProfile -ExecutionPolicy Bypass -File tools\deploy\deploy.ps1
#
#  原理：服务器连不上 GitHub（出口超时），所以走 SFTP 整仓同步：
#    本地 -> <DEPLOY_DIR>.new -> 停服 -> 旧目录改名 .old -> 新目录就位 -> 启服 -> 健康检查
#  依赖 ssh2 装在 %TEMP%（仓库外），不污染项目、不入库。
#  密码只进内存/环境变量，不写文件、不入仓库。
# ============================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }

# 1) 依赖 ssh2（装在仓库外的临时目录）
$dep = Join-Path $env:TEMP 'splendor-ssh2'
if (-not (Test-Path (Join-Path $dep 'node_modules\ssh2'))) {
  Say '首次运行：安装部署依赖 ssh2（装在 %TEMP%，不进仓库）...' 'Cyan'
  npm i ssh2 --prefix $dep --no-audit --no-fund | Out-Null
  if ($LASTEXITCODE -ne 0) { Say '依赖安装失败' 'Red'; exit 1 }
}
$env:NODE_PATH = Join-Path $dep 'node_modules'

# 2) 连接参数（可用环境变量覆盖）
if (-not $env:DEPLOY_HOST) { $env:DEPLOY_HOST = '124.221.228.93' }
if (-not $env:DEPLOY_USER) { $env:DEPLOY_USER = 'ubuntu' }
if (-not $env:DEPLOY_DIR)  { $env:DEPLOY_DIR  = '/home/ubuntu/splendor-game' }
if (-not $env:DEPLOY_PASS) {
  $sec = Read-Host '请输入服务器 SSH 密码（仅用于本次连接，不会保存）' -AsSecureString
  $env:DEPLOY_PASS = [System.Net.NetworkCredential]::new('', $sec).Password
}

# 3) 同步 + 换目录 + 重启 + 远端健康检查
Set-Location $root
Say ('==> 同步到 ' + $env:DEPLOY_USER + '@' + $env:DEPLOY_HOST + ' ...') 'Cyan'
node tools\deploy\sftp-sync.js
if ($LASTEXITCODE -ne 0) {
  Say '部署失败：服务器上的上一版仍在 <DEPLOY_DIR>.old，可手动回滚' 'Red'
  exit 1
}

# 4) 公网地址复查
$addr = if ($env:DEPLOY_PUBLIC) { $env:DEPLOY_PUBLIC } else { 'http://124.221.228.93:3000' }
try {
  $r = Invoke-WebRequest -Uri ($addr + '/health') -UseBasicParsing -TimeoutSec 15
  Say ('==> 公网可用：' + $addr + '  ' + $r.Content) 'Green'
} catch {
  Say ('公网暂时没响应（' + $addr + '）：' + $_.Exception.Message) 'Yellow'
}
Say '部署完成' 'Green'
