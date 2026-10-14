$ErrorActionPreference = 'Stop'

$taskName = 'EventHub-ExpireBookings'
$runnerPath = (Resolve-Path (Join-Path $PSScriptRoot 'expire_bookings.ps1')).Path
$powershellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskAction = "`"$powershellPath`" -NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

try {
    & schtasks.exe /Create /TN $taskName /TR $taskAction /SC MINUTE /MO 1 /F | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks.exe could not register the task. Exit code: $LASTEXITCODE"
    }

    Write-Host "Registered or updated scheduled task: $taskName"
    Write-Host "Runs every minute using: $runnerPath"
    Write-Host "Check status: schtasks.exe /Query /TN `"$taskName`" /FO LIST /V"
    Write-Host "Check logs: $(Join-Path $PSScriptRoot '..\logs\expire_bookings.log')"
    Write-Host 'Administrator privileges are normally not required for a task owned by the current user. If Windows denies registration, rerun PowerShell as Administrator.'
}
catch {
    Write-Error $_
    Write-Host 'Manual command:'
    Write-Host "schtasks.exe /Create /TN `"$taskName`" /TR `"$taskAction`" /SC MINUTE /MO 1 /F"
    exit 1
}
