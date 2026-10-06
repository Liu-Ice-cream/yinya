$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskUrl = 'http://127.0.0.1:9093/yinya/'
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'website\yinya\assets\app.js'))) {
    & $taskNode 'scripts/build-yinya.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. Run npm ci --ignore-scripts, then npm run build-yinya.' }
}
$taskRunning = $false
try {
    $taskResponse = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 2 -UseBasicParsing
    $taskRunning = $taskResponse.StatusCode -eq 200 -and $taskResponse.Content.Contains('YINYA')
} catch {}
if (-not $taskRunning) {
    New-Item -ItemType Directory -Path (Join-Path $taskRoot 'build') -Force | Out-Null
    Start-Process -FilePath $taskNode -ArgumentList @('scripts/serve-yinya.mjs') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'build\server.log') -RedirectStandardError (Join-Path $taskRoot 'build\server-error.log') | Out-Null
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $taskResponse = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 1 -UseBasicParsing
            if ($taskResponse.StatusCode -eq 200 -and $taskResponse.Content.Contains('YINYA')) { $taskRunning = $true; break }
        } catch {}
    }
}
if (-not $taskRunning) { throw 'Could not start Yinya on port 9093. See build/server-error.log.' }
Start-Process $taskUrl
