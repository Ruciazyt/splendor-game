# 一键打包：把开发源打成 splendor-web.zip（内容根 = 项目根，不含外层文件夹）
$ErrorActionPreference = 'Stop'
# 脚本在 tools/build/ 下，根目录要上溯两级（tools/build → tools → 项目根）
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$zip = Join-Path $root 'splendor-web.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$items = @()
$items += @('server.js','package.json','start.bat','start-tunnel.bat','start-all.bat','start-all.ps1','splendor-autostart.cmd','README.md','DESIGN.md') | Where-Object { Test-Path (Join-Path $root $_) } | ForEach-Object { Get-Item (Join-Path $root $_) }
foreach ($d in @('server','public','shared','docs','rules')) { $items += Get-ChildItem (Join-Path $root $d) -Recurse -File }
# tools/ 只带脚本，不带 55MB 的 cloudflared.exe（另行下载，见 .gitignore）
$items += Get-ChildItem (Join-Path $root 'tools') -Recurse -File | Where-Object { $_.Extension -in @('.js','.mjs','.ps1','.cmd','.bat') }
$fs = [System.IO.File]::Open($zip, 'Create')
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in $items) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\','/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$archive.Dispose(); $fs.Dispose()
$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host ("已生成 splendor-web.zip  ({0} 个文件, {1} MB)" -f $items.Count, $size)