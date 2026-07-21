$ws = New-Object -ComObject WScript.Shell

$repoPath = 'C:\Users\Unkno\9router-protocal-killer'
$watchdog = "$repoPath\watchdog.js"
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$iconFallback = "$env:SystemRoot\System32\shell32.dll"

$targets = @(
  @{ Path = (Join-Path $desktop '9router-Killer-Watch.lnk'); Where = 'Desktop' },
  @{ Path = (Join-Path $startMenu '9router-Killer-Watch.lnk'); Where = 'Start Menu' }
)

foreach ($t in $targets) {
  $sc = $ws.CreateShortcut($t.Path)
  $sc.TargetPath = 'node.exe'
  $sc.Arguments = "`"$watchdog`" --watch"
  $sc.WorkingDirectory = $repoPath
  $sc.IconLocation = "$iconFallback,12"
  $sc.Description = '9router Protocol Killer — Watchdog (auto-clean chunked protocol)'
  $sc.Save()
  Write-Host "Created $($t.Where) shortcut: $($t.Path)"
}

# Also drop a .bat for terminal-based launch
$bat = @"
@echo off
cd /d "$repoPath"
node watchdog.js --watch
pause
"@
$batPath = Join-Path $desktop '9router-Killer-Watch.bat'
$bat | Out-File -FilePath $batPath -Encoding ASCII
Write-Host "Created BAT launcher: $batPath"
