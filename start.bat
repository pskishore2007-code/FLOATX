@echo off
title FLOATX Launcher
echo ========================================================
echo   Launching FLOATX Ocean Intelligence Platform
echo ========================================================
echo.
echo 1. Starting Python FastAPI Backend on port 8000...
start "FLOATX Python Backend (Port 8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn floatx.main:app --host 127.0.0.1 --port 8000"

echo 2. Starting Next.js Dev Server on port 3000...
start "FLOATX Next.js Frontend (Port 3000)" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================================
echo   FLOATX is now running!
echo   Local:   http://localhost:3000
echo   Backend: http://127.0.0.1:8000
echo ========================================================
echo You can close this window now.
timeout /t 5
