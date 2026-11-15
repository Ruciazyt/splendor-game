
$ErrorActionPreference='Continue'
$ua='Mozilla/5.0'
$base='https://ghproxy.net/https://raw.githubusercontent.com/NicolasVero/splendor/master/application/splendor/images/'
New-Item -ItemType Directory -Force -Path public/assets/cards,public/assets/nobles,public/assets/tokens | Out-Null
$list = New-Object System.Collections.ArrayList
for($i=1;$i -le 40;$i++){ [void]$list.Add(('dev_I_' + $i.ToString('00') + '.png|cards')) }
for($i=1;$i -le 30;$i++){ [void]$list.Add(('dev_II_' + $i.ToString('00') + '.png|cards')) }
for($i=1;$i -le 20;$i++){ [void]$list.Add(('dev_III_' + $i.ToString('00') + '.png|cards')) }
for($i=1;$i -le 10;$i++){ [void]$list.Add(('noble_' + $i.ToString('00') + '.png|nobles')) }
$tok = @{ 'jeton_blanc.png'='white'; 'jeton_bleu.png'='blue'; 'jeton_jaune.png'='gold'; 'jeton_marron.png'='black'; 'jeton_rouge.png'='red'; 'jeton_vert.png'='green' }
foreach($k in $tok.Keys){ [void]$list.Add(($k + '|tokens/' + $tok[$k])) }

$chunks = 10
$per = [math]::Ceiling($list.Count / $chunks)
$procs = @()
for($c=0; $c -lt $chunks; $c++){
  $start = $c * $per
  $end = [math]::Min($list.Count, $start + $per)
  if($start -ge $end){ continue }
  $lines = @()
  for($i=$start; $i -lt $end; $i++){
    $parts = ([string]$list[$i]).Split('|')
    $lines += ('url = "' + $base + $parts[0] + '"')
    $lines += ('output = "public/assets/' + $parts[1] + '/' + $parts[0] + '"')
  }
  $cfg = 'tmp_dl_' + $c + '.cfg'
  Set-Content -Path $cfg -Value $lines -Encoding ascii
  $procs += Start-Process -FilePath 'curl.exe' -ArgumentList ('-s','-L','--http1.1','-k','-A',$ua,'--max-time','120','-K',$cfg) -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
}
$procs | Wait-Process -Timeout 260
'--- result ---'
Get-ChildItem public/assets -Recurse -File | Group-Object DirectoryName | ForEach-Object { ($_.Name -replace [regex]::Escape((Get-Location).Path),'') + ' = ' + $_.Count }
'total KB = ' + [math]::Round((Get-ChildItem public/assets -Recurse -File | Measure-Object -Property Length -Sum).Sum/1KB)
'invalid = ' + (Get-ChildItem public/assets -Recurse -File | Where-Object { $_.Length -lt 1000 }).Count
