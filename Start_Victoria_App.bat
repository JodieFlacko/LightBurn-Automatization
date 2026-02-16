@echo off
TITLE Victoria Laser App Server
COLOR 0A

:: 1. Navigate to the server directory
cd server

:: 2. Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo CRITICAL ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit
)

:: 3. Start the Browser immediately (it will retry connection)
:: wait 2 seconds to give server a head start
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

:: 4. Start the Production Server
echo Starting Victoria Laser App...
echo DO NOT CLOSE THIS WINDOW while using the app.
echo ---------------------------------------------------
node dist/src/index.js