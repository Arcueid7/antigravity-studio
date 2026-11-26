@echo off
chcp 65001 >nul
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765 " ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo Stopping existing Harness server on port 8765 (PID %%a)...
        taskkill /PID %%a /F >nul 2>&1
    )
)
echo Starting Antigravity Studio (agy)...
python server.py --port 8765 --open
pause
