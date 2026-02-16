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

:: 3. Start the Browser immediately
:: We use localhost:3001 because we are running the Production Build
start "" "http://localhost:3001"

:: 4. Start the Server
echo Starting Victoria Laser App...
echo ---------------------------------------------------
echo When you close the browser tab, this window will close automatically.
echo ---------------------------------------------------

:: Navigate to server folder and run the BUILT code
cd server
node dist/src/index.js

:: 5. THE MAGIC LINE
:: When 'node' finishes (via graceful shutdown), this command runs and closes the window.
exit