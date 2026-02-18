@echo off
TITLE Victoria Laser App Server
COLOR 0A

:: 1. Navigate to the project root
cd /d "%~dp0"

:: 2. Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo CRITICAL ERROR: Node.js is not installed!
    pause
    exit
)

:: 3. Start the Server
echo Starting Victoria Laser App...
echo Waiting for server to be ready...
echo ---------------------------------------------------

:: Navigate to server folder and start in background
cd server
start /B node dist/src/index.js

:: 4. Wait for server to be ready (poll port 3001)
:wait_loop
timeout /t 1 /nobreak >nul
powershell -Command "try { $client = New-Object System.Net.Sockets.TcpClient('localhost', 3001); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 goto wait_loop

:: 5. Server is ready, open browser
echo Server is ready! Opening browser...
echo ---------------------------------------------------
echo When you close the browser tab, this window will close automatically.
echo ---------------------------------------------------
start "" "http://localhost:3001"

:: 6. Wait for the node process to finish (graceful shutdown)
:monitor
timeout /t 2 /nobreak >nul
tasklist /FI "IMAGENAME eq node.exe" /NH 2>nul | find /I "node.exe" >nul
if %errorlevel% equ 0 goto monitor

:: Server has stopped, exit
echo Server stopped. Closing...
exit