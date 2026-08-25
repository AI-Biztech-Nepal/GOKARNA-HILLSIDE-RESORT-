# One-time setup: registers a scheduled task that starts the resort server
# automatically whenever you log into Windows, and keeps it running (see
# run_server.ps1 for the self-restart loop).
#
# Must be run as Administrator:
#   Right-click this file -> "Run with PowerShell" won't be enough on its own
#   if PowerShell itself isn't elevated. Easiest path:
#     1. Press Start, type "PowerShell", right-click it, "Run as administrator"
#     2. cd into this scripts folder
#     3. Run:  .\install_startup_task.ps1

$scriptDir = $PSScriptRoot
$runScript = Join-Path $scriptDir "run_server.ps1"

# Resolve to the 8.3 short path so spaces/ampersands in the folder name
# ("Hamro G&G auto") can't break the scheduled task's command line.
$fso = New-Object -ComObject Scripting.FileSystemObject
$shortPath = $fso.GetFile($runScript).ShortPath

$taskName = "GokarnaHillsideResortServer"
$trArg = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $shortPath"

schtasks /Create /TN $taskName /TR $trArg /SC ONLOGON /RL LIMITED /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "Task registered. Starting it now..."
    schtasks /Run /TN $taskName
    Write-Host "Done. The server will now start automatically every time you log in."
    Write-Host "Check c:\Users\chand\OneDrive\Desktop\Hamro G&G auto\Gokarna-Hillside-Resort\server.log if it doesn't come up."
} else {
    Write-Host "Task registration failed (exit code $LASTEXITCODE). Make sure this PowerShell window is running as Administrator."
}
