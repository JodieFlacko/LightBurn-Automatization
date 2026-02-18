# Victoria Laser App - PowerShell Launcher
# Starts the server, waits for it to be ready, then opens the browser

# Set window title
$host.UI.RawUI.WindowTitle = "Victoria Laser App Server"

# Navigate to script directory
Set-Location $PSScriptRoot

# Check if Node is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "CRITICAL ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting Victoria Laser App..." -ForegroundColor Green
Write-Host "---------------------------------------------------"

# Start the Node.js server process
Set-Location server
$serverProcess = Start-Process -FilePath "node" -ArgumentList "dist/src/index.js" -PassThru -WindowStyle Hidden

Write-Host "Waiting for server to start..." -ForegroundColor Yellow

# Wait for server to be ready (check port 3001)
$maxAttempts = 30
$attempt = 0
$serverReady = $false

while ($attempt -lt $maxAttempts -and -not $serverReady) {
    $attempt++
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $tcpClient.Connect("localhost", 3001)
        $tcpClient.Close()
        $serverReady = $true
        Write-Host "Server is ready!" -ForegroundColor Green
    }
    catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $serverReady) {
    Write-Host "ERROR: Server failed to start within 15 seconds" -ForegroundColor Red
    $serverProcess.Kill()
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "---------------------------------------------------"
Write-Host "When you close the browser tab, this window will close automatically." -ForegroundColor Cyan
Write-Host "---------------------------------------------------"

# Open the browser
Start-Process "http://localhost:3001"

# Wait for the server process to exit (graceful shutdown)
Write-Host "Server running... (PID: $($serverProcess.Id))" -ForegroundColor Gray
$serverProcess.WaitForExit()

Write-Host "Server stopped. Exiting..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
exit 0
