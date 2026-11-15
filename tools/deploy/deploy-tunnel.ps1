$ErrorActionPreference='Stop'
$ws  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # 项目根
$cf  = Join-Path $env:USERPROFILE '.cloudflared'
$exe = Join-Path $ws 'tools\cloudflared.exe'
$name = 'splendor'
$host_ = 'game.ruciazyt.cn'
$port = 3000

if(-not (Test-Path (Join-Path $cf 'cert.pem'))){ '缺少 cert.pem，请先完成 tunnel login'; exit 1 }

'1) 创建隧道（已存在则复用）'
$existing = & $exe tunnel list --output json 2>$null | ConvertFrom-Json
$tunnel = $existing | Where-Object { $_.name -eq $name } | Select-Object -First 1
if($tunnel){ $id = $tunnel.id; "   复用隧道 $id" } else {
  $out = & $exe tunnel create $name 2>&1 | Out-String
  if($out -match '([0-9a-f]{8}-[0-9a-f-]{27})'){ $id = $Matches[1] } else { $out; exit 1 }
  "   已创建隧道 $id"
}

'2) DNS 指向隧道'
$dns = & $exe tunnel route dns $id $host_ 2>&1 | Out-String
"   $($dns.Trim())"

'3) 写入 ingress 配置'
$cfg = @"
tunnel: $id
credentials-file: $(Join-Path $cf ($id + '.json'))
ingress:
  - hostname: $host_
    service: http://localhost:$port
  - service: http_status:404
"@
$cfgPath = Join-Path $cf 'config.yml'
Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8
"   $cfgPath"

'4) 启动隧道'
$log = Join-Path $ws 'tools\tunnel.named.log'
Start-Process -FilePath $exe -ArgumentList 'tunnel','--no-autoupdate','--config',$cfgPath,'run',$name -RedirectStandardOutput "$ws\tools\tunnel.named.out.log" -RedirectStandardError $log -WindowStyle Hidden
Start-Sleep -Seconds 8
Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 12
