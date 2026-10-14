$ErrorActionPreference = 'Stop'

$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonPath = Join-Path $backendRoot 'venv\Scripts\python.exe'
$managePath = Join-Path $backendRoot 'manage.py'
$logDirectory = Join-Path $backendRoot 'logs'
$logPath = Join-Path $logDirectory 'expire_bookings.log'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-LogLine {
    param([string]$Message)

    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')] $Message" | Add-Content -Path $logPath -Encoding utf8
}

try {
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        throw "Virtual-environment Python was not found at $pythonPath"
    }

    if (-not (Test-Path -LiteralPath $managePath)) {
        throw "Django manage.py was not found at $managePath"
    }

    Push-Location $backendRoot
    Write-LogLine 'Starting expire_bookings.'
    & $pythonPath $managePath expire_bookings 2>&1 | ForEach-Object {
        Write-LogLine ([string]$_)
    }
    $exitCode = $LASTEXITCODE
    Write-LogLine "Finished expire_bookings with exit code $exitCode."
}
catch {
    Write-LogLine "expire_bookings failed: $($_.Exception.Message)"
    $exitCode = 1
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
}

exit $exitCode
