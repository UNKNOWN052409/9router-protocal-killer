<#
.SYNOPSIS
    9router Protocol Killer v2 — Watchdog Active (PowerShell)
.DESCRIPTION
    Background me watchdog chalata hai (hidden window).
    Har 30s check karta hai, apne aap clean karta hai.
    PC reboot ke baad phir se chalao — ya Task Scheduler me daalo.
#>

$script:WatchdogPath = "C:\Users\Unkno\9router-protocal-killer\watchdog.js"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " 9router Protocol Killer v2 — Watchdog Active" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Mode: SAFE CLEAN (files preserve, sirf protocol hatega)" -ForegroundColor Green
Write-Host ""

# Check if already running
$existing = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "watchdog.*--watch"
}
if ($existing) {
    Write-Host "⚠️ Watchdog already running! PID: $($existing.Id)" -ForegroundColor Yellow
    Write-Host "Pehle se chal raha hai — kuch karne ki zaroorat nahi." -ForegroundColor Yellow
    exit 0
}

# Start hidden node process
try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node"
    $psi.Arguments = "`"$WatchdogPath`" --watch"
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.UseShellExecute = $true
    $psi.WorkingDirectory = "C:\Users\Unkno\9router-protocal-killer"

    $p = [System.Diagnostics.Process]::Start($psi)
    
    Write-Host "✅ Watchdog started successfully! (PID: $($p.Id))" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ye background me chalta rahega aur har 30s me check karega." -ForegroundColor Yellow
    Write-Host "Jab tak Windows chal raha hai, ye active rahega." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Band karna ho to Task Manager me jao aur node process kill karo." -ForegroundColor Magenta
    Write-Host "Ya yeh command chalao: Stop-Process -Id $($p.Id) -Force" -ForegroundColor Magenta
    
    # Save PID for later
    $p.Id | Out-File -FilePath "$env:TEMP\9router-watchdog.pid" -Force
}
catch {
    Write-Host "❌ Error starting watchdog: $_" -ForegroundColor Red
    Write-Host "Kya tumne 'npm install' kiya hai?" -ForegroundColor Yellow
    exit 1
}
