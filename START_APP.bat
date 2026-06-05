@echo off
echo ================================================
echo        EnergyAI - Starting All Services
echo ================================================
echo.

SET ROOT=%~dp0

echo [1/3] Starting ML Service (Python)...
start "ML Service" cmd /k "cd /d "%ROOT%ml-service" && python app.py"
timeout /t 3 >nul

echo [2/3] Starting Backend API (Node.js)...
start "Backend API" cmd /k "cd /d "%ROOT%backend" && node server.js"
timeout /t 3 >nul

echo [3/3] Starting Frontend...
start "Frontend" cmd /k "cd /d "%ROOT%frontend" && npx http-server -p 8000 -c-1"
timeout /t 3 >nul

echo.
echo ================================================
echo   App running at: http://localhost:8000
echo ================================================
echo.
start http://localhost:8000
pause
