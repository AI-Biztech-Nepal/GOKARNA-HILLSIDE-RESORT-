# Keeps server.py running permanently: starts it, and if it ever exits
# (crash, forced kill, etc.) waits a few seconds and starts it again.
# Launched automatically at logon by the "GokarnaHillsideResortServer"
# scheduled task — see README_ADMIN.md for how that's registered.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logFile = Join-Path $root "server.log"

while ($true) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) - starting server.py"
    py server.py *>> $logFile
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) - server.py exited (code $LASTEXITCODE), restarting in 5s"
    Start-Sleep -Seconds 5
}
